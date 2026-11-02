const { Op } = require('sequelize');
const { Message, MessageLike, User, Space, SpaceMember } = require('../models');
const wordCounter = require('../utils/wordCounter');
const cloudinary = require('../config/cloudinary');
const notificationQueue = require('../queues/notificationQueue');
const assertSpaceReadable = require('../utils/assertSpaceReadable');

class MessageService {
    /**
     * Send a message to a space.
     */
    async sendMessage({ spaceId, senderId, content, file, mediaType }) {
        const space = await Space.findByPk(spaceId);
        if (!space) throw Object.assign(new Error('Space not found'), { status: 404 });
        if (space.is_locked) throw Object.assign(new Error('Space is locked'), { status: 403 });
        if (space.is_archived) throw Object.assign(new Error('Space is archived'), { status: 403 });

        // Verify membership
        const membership = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: senderId } });
        if (!membership) throw Object.assign(new Error('You must be a member to send messages'), { status: 403 });

        // Must have either content or file
        if (!content && !file) throw Object.assign(new Error('Message must have text or media'), { status: 400 });

        let media_url = null;
        let media_type = null;
        if (file) {
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'space7/messages', resource_type: 'auto' },
                    (err, result) => (err ? reject(err) : resolve(result))
                );
                stream.end(file.buffer);
            });
            media_url = result.secure_url;

            // Auto-detect media type from mimetype or use provided value
            if (mediaType) {
                media_type = mediaType;
            } else if (file.mimetype) {
                if (file.mimetype.startsWith('image/')) media_type = 'image';
                else if (file.mimetype.startsWith('video/')) media_type = 'video';
                else if (file.mimetype.startsWith('audio/')) media_type = 'audio';
            }
        }

        const word_count = content ? wordCounter(content) : 0;

        const message = await Message.create({
            space_id: spaceId,
            sender_id: senderId,
            content: content || null,
            media_url,
            media_type,
            word_count,
        });

        // Notify other members about new message
        const members = await SpaceMember.findAll({
            where: { space_id: spaceId, user_id: { [Op.ne]: senderId } },
        });
        for (const m of members) {
            await notificationQueue.add('new-message', {
                user_id: m.user_id,
                type: 'new_message',
                reference_id: message.message_id,
                message: `New message in "${space.title}"`,
            });
        }

        // Return the message with sender info
        return Message.findByPk(message.message_id, {
            include: [{ model: User, as: 'sender', attributes: ['user_id', 'username', 'profile_picture'] }],
        });
    }

    /**
     * Get messages for a space with sorting.
     */
    async getMessages(spaceId, userId, { sort = 'recent', page = 1, limit = 50 }) {
        await assertSpaceReadable(spaceId, userId);

        const offset = (page - 1) * limit;

        let order;
        if (sort === 'most_appreciated') {
            order = [[require('sequelize').literal('(SELECT COUNT(*) FROM message_likes WHERE message_likes.message_id = "Message".message_id)'), 'DESC']];
        } else {
            order = [['created_at', 'DESC']];
        }

        const { count, rows } = await Message.findAndCountAll({
            where: { space_id: spaceId },
            include: [
                { model: User, as: 'sender', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: MessageLike, as: 'likes', attributes: ['id', 'user_id'] },
            ],
            order,
            limit,
            offset,
        });

        return {
            messages: rows.map((msg) => {
                const json = msg.toJSON();
                json.appreciation_count = json.likes.length;
                return json;
            }),
            total: count,
            page,
            totalPages: Math.ceil(count / limit),
        };
    }

    /**
     * Toggle appreciation (like) on a message.
     */
    async toggleAppreciation(messageId, userId) {
        const message = await Message.findByPk(messageId);
        if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });
        await assertSpaceReadable(message.space_id, userId);

        const existing = await MessageLike.findOne({ where: { message_id: messageId, user_id: userId } });

        if (existing) {
            await existing.destroy();
            return { appreciated: false };
        }

        await MessageLike.create({ message_id: messageId, user_id: userId });

        // Notify message author
        if (message.sender_id !== userId) {
            await notificationQueue.add('appreciation', {
                user_id: message.sender_id,
                type: 'appreciation_received',
                reference_id: messageId,
                message: 'Someone appreciated your message!',
            });
        }

        return { appreciated: true };
    }

    /**
     * Delete a message (creator or message author).
     */
    async deleteMessage(messageId, userId) {
        const message = await Message.findByPk(messageId);
        if (!message) throw Object.assign(new Error('Message not found'), { status: 404 });

        const isAuthor = message.sender_id === userId;
        const isCreator = await SpaceMember.findOne({
            // Use the message's own space, not the one in the URL, so a creator
            // of one space cannot delete messages in another.
            where: { space_id: message.space_id, user_id: userId, role: 'creator' },
        });

        if (!isAuthor && !isCreator) {
            throw Object.assign(new Error('Not authorised to delete this message'), { status: 403 });
        }

        await MessageLike.destroy({ where: { message_id: messageId } });
        await message.destroy();
        return { message: 'Message deleted' };
    }
}

module.exports = new MessageService();
