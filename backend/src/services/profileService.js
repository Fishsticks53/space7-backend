const bcrypt = require('bcrypt');
const { User, Space, SpaceMember, Message, MessageLike } = require('../models');
const { Op, fn, col } = require('sequelize');
const cloudinary = require('../config/cloudinary');

class ProfileService {
    /**
     * Get user profile with contribution stats.
     */
    async getProfile(userId) {
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password_hash'] },
        });
        if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

        // Compute stats
        const spaces_created = await Space.count({ where: { creator_id: userId } });
        const spaces_participated = await SpaceMember.count({ where: { user_id: userId } });

        const wordResult = await Message.sum('word_count', { where: { sender_id: userId } });
        const total_words_contributed = wordResult || 0;

        const messageIds = (await Message.findAll({
            where: { sender_id: userId },
            attributes: ['message_id'],
        })).map((m) => m.message_id);

        const total_appreciations_received = messageIds.length
            ? await MessageLike.count({ where: { message_id: { [Op.in]: messageIds } } })
            : 0;

        return {
            ...user.toJSON(),
            stats: {
                spaces_created,
                spaces_participated,
                total_words_contributed,
                total_appreciations_received,
            },
        };
    }

    /**
     * Get public profile of another user.
     */
    async getPublicProfile(userId) {
        const { email: _email, ...profile } = await this.getProfile(userId);

        // Also get public spaces they created
        const publicSpaces = await Space.findAll({
            where: { creator_id: userId, visibility: 'public' },
            attributes: ['space_id', 'title', 'description', 'created_at'],
        });

        return { ...profile, publicSpaces };
    }

    /**
     * Search users by username.
     */
    async searchUsers(query, limit = 20) {
        return User.findAll({
            where: { username: { [Op.iLike]: `%${query}%` }, is_verified: true },
            attributes: ['user_id', 'username', 'bio', 'profile_picture'],
            limit,
        });
    }

    /**
     * Update username.
     */
    async updateUsername(userId, username) {
        const user = await User.findByPk(userId);
        user.username = username;
        await user.save();
        return { username: user.username };
    }

    /**
     * Update bio.
     */
    async updateBio(userId, bio) {
        const user = await User.findByPk(userId);
        user.bio = bio;
        await user.save();
        return { bio: user.bio };
    }

    /**
     * Update profile picture via Cloudinary.
     */
    async updateProfilePicture(userId, file) {
        if (!file) throw Object.assign(new Error('No file provided'), { status: 400 });

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'space7/avatars', transformation: [{ width: 400, height: 400, crop: 'fill' }] },
                (err, result) => (err ? reject(err) : resolve(result))
            );
            stream.end(file.buffer);
        });

        const user = await User.findByPk(userId);
        user.profile_picture = result.secure_url;
        await user.save();
        return { profile_picture: user.profile_picture };
    }

    /**
     * Change password.
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await User.findByPk(userId);
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });

        user.password_hash = await bcrypt.hash(newPassword, 12);
        await user.save();
        return { message: 'Password changed successfully' };
    }

    /**
     * Delete account.
     */
    async deleteAccount(userId) {
        const user = await User.findByPk(userId);
        if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
        await user.destroy();
        return { message: 'Account deleted' };
    }
}

module.exports = new ProfileService();
