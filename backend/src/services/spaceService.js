const { Op, fn, col, literal } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { Space, SpaceMember, User, Tag, SpaceTag, InviteCode, Message } = require('../models');
const notificationQueue = require('../queues/notificationQueue');
const assertSpaceReadable = require('../utils/assertSpaceReadable');

class SpaceService {
    /**
     * Create a new space with optional hashtags.
     */
    async createSpace({ title, description, visibility, hashtags }, creatorId) {
        const space = await Space.create({
            title,
            description,
            visibility,
            creator_id: creatorId,
        });

        // Add creator as member with role=creator
        await SpaceMember.create({
            space_id: space.space_id,
            user_id: creatorId,
            role: 'creator',
        });

        // Process hashtags
        if (hashtags && hashtags.length > 0) {
            for (const tagName of hashtags) {
                const normalised = tagName.toLowerCase().replace(/^#/, '');
                const [tag] = await Tag.findOrCreate({ where: { tag_name: normalised } });
                await SpaceTag.findOrCreate({ where: { space_id: space.space_id, tag_id: tag.tag_id } });
            }
        }

        return this.getSpaceById(space.space_id, creatorId);
    }

    /**
     * Get a single space by ID with creator, members, tags, and message count.
     */
    async getSpaceById(spaceId, userId) {
        await assertSpaceReadable(spaceId, userId);

        const space = await Space.findByPk(spaceId, {
            include: [
                { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: SpaceMember, as: 'members', include: [{ model: User, as: 'user', attributes: ['user_id', 'username', 'profile_picture'] }] },
                { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
            ],
        });

        if (!space) throw Object.assign(new Error('Space not found'), { status: 404 });

        const messageCount = await Message.count({ where: { space_id: spaceId } });
        const result = space.toJSON();
        result.participant_count = result.members.length;
        result.message_count = messageCount;

        return result;
    }

    /**
     * Join a public space or a private space via invite code.
     */
    async joinSpace(spaceId, userId, inviteCode) {
        const space = await Space.findByPk(spaceId);
        if (!space) throw Object.assign(new Error('Space not found'), { status: 404 });
        if (space.is_locked) throw Object.assign(new Error('Space is locked'), { status: 403 });
        if (space.is_archived) throw Object.assign(new Error('Space is archived'), { status: 403 });

        // Check if already a member
        const alreadyMember = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: userId } });
        if (alreadyMember) throw Object.assign(new Error('Already a member'), { status: 409 });

        if (space.visibility === 'private') {
            if (!inviteCode) throw Object.assign(new Error('Invite code required for private spaces'), { status: 400 });

            const code = await InviteCode.findOne({
                where: { code: inviteCode, space_id: spaceId, is_used: false },
            });
            if (!code) throw Object.assign(new Error('Invalid invite code'), { status: 400 });
            if (new Date() > code.expires_at) throw Object.assign(new Error('Invite code expired'), { status: 400 });

            code.is_used = true;
            code.used_by = userId;
            await code.save();

            // Notify creator that invite code was used
            await notificationQueue.add('invite-used', {
                user_id: space.creator_id,
                type: 'invite_used',
                reference_id: spaceId,
                message: `A user joined your space "${space.title}" using an invite code`,
            });
        }

        await SpaceMember.create({ space_id: spaceId, user_id: userId, role: 'member' });
        return { message: 'Joined space successfully' };
    }

    /**
     * Generate an invite code (creator only).
     */
    async generateInviteCode(spaceId, creatorId) {
        const member = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: creatorId, role: 'creator' } });
        if (!member) throw Object.assign(new Error('Only the creator can generate invite codes'), { status: 403 });

        const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const inviteCode = await InviteCode.create({
            space_id: spaceId,
            code,
            created_by: creatorId,
            expires_at: expiresAt,
        });

        return { code: inviteCode.code, expires_at: inviteCode.expires_at };
    }

    /**
     * List all invite codes for a space (creator only).
     */
    async getInviteCodes(spaceId, creatorId) {
        const member = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: creatorId, role: 'creator' } });
        if (!member) throw Object.assign(new Error('Only the creator can view invite codes'), { status: 403 });

        const codes = await InviteCode.findAll({
            where: { space_id: spaceId },
            include: [{ model: User, as: 'usedByUser', attributes: ['user_id', 'username'] }],
            order: [['created_at', 'DESC']],
        });

        return codes.map((c) => {
            const json = c.toJSON();
            json.status = json.is_used ? 'used' : (new Date() > new Date(json.expires_at) ? 'expired' : 'active');
            return json;
        });
    }

    /**
     * Remove a member (creator only).
     */
    async removeMember(spaceId, creatorId, targetUserId) {
        const creator = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: creatorId, role: 'creator' } });
        if (!creator) throw Object.assign(new Error('Only the creator can remove members'), { status: 403 });

        if (creatorId === targetUserId) throw Object.assign(new Error('Cannot remove yourself'), { status: 400 });

        const member = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: targetUserId } });
        if (!member) throw Object.assign(new Error('User is not a member'), { status: 404 });

        await member.destroy();
        return { message: 'Member removed' };
    }

    /**
     * Lock / unlock a space (creator only).
     */
    async toggleLock(spaceId, creatorId) {
        const creator = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: creatorId, role: 'creator' } });
        if (!creator) throw Object.assign(new Error('Only the creator can lock/unlock'), { status: 403 });

        const space = await Space.findByPk(spaceId);
        space.is_locked = !space.is_locked;
        await space.save();

        // Notify all members
        const members = await SpaceMember.findAll({ where: { space_id: spaceId, user_id: { [Op.ne]: creatorId } } });
        for (const m of members) {
            await notificationQueue.add('space-locked', {
                user_id: m.user_id,
                type: 'space_locked',
                reference_id: spaceId,
                message: `Space "${space.title}" has been ${space.is_locked ? 'locked' : 'unlocked'}`,
            });
        }

        return { is_locked: space.is_locked };
    }

    /**
     * Archive a space (creator only).
     */
    async archiveSpace(spaceId, creatorId) {
        const creator = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: creatorId, role: 'creator' } });
        if (!creator) throw Object.assign(new Error('Only the creator can archive'), { status: 403 });

        const space = await Space.findByPk(spaceId);
        space.is_archived = true;
        await space.save();

        const members = await SpaceMember.findAll({ where: { space_id: spaceId, user_id: { [Op.ne]: creatorId } } });
        for (const m of members) {
            await notificationQueue.add('space-archived', {
                user_id: m.user_id,
                type: 'space_archived',
                reference_id: spaceId,
                message: `Space "${space.title}" has been archived`,
            });
        }

        return { message: 'Space archived' };
    }

    /**
     * Trending spaces based on recent message activity + participant count.
     */
    async getTrending(limit = 10) {
        const spaces = await Space.findAll({
            where: { is_archived: false },
            include: [
                { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
                { model: SpaceMember, as: 'members', attributes: ['id'] },
            ],
            order: [[literal('(SELECT COUNT(*) FROM messages WHERE messages.space_id = "Space".space_id AND messages.created_at > NOW() - INTERVAL \'7 days\') + (SELECT COUNT(*) FROM space_members WHERE space_members.space_id = "Space".space_id)'), 'DESC']],
            limit,
        });

        return spaces.map((s) => {
            const json = s.toJSON();
            json.participant_count = json.members.length;
            delete json.members;
            return json;
        });
    }

    /**
     * Search spaces by title or description.
     */
    async searchSpaces(query, limit = 20) {
        const spaces = await Space.findAll({
            where: {
                is_archived: false,
                [Op.or]: [
                    { title: { [Op.iLike]: `%${query}%` } },
                    { description: { [Op.iLike]: `%${query}%` } },
                ],
            },
            include: [
                { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
                { model: SpaceMember, as: 'members', attributes: ['id'] },
            ],
            limit,
        });

        return spaces.map((s) => {
            const json = s.toJSON();
            json.participant_count = json.members.length;
            delete json.members;
            return json;
        });
    }

    /**
     * Search spaces by tag.
     */
    async searchByTag(tagName, limit = 20) {
        const normalised = tagName.toLowerCase().replace(/^#/, '');
        const tag = await Tag.findOne({ where: { tag_name: normalised } });
        if (!tag) return [];

        const spaceIds = (await SpaceTag.findAll({ where: { tag_id: tag.tag_id } })).map((st) => st.space_id);

        const spaces = await Space.findAll({
            where: { space_id: { [Op.in]: spaceIds }, is_archived: false },
            include: [
                { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
                { model: SpaceMember, as: 'members', attributes: ['id'] },
            ],
            limit,
        });

        return spaces.map((s) => {
            const json = s.toJSON();
            json.participant_count = json.members.length;
            delete json.members;
            return json;
        });
    }

    /**
     * Get recommended spaces (public, non-archived, user is not a member).
     */
    async getRecommended(userId, limit = 10) {
        const memberSpaceIds = (
            await SpaceMember.findAll({ where: { user_id: userId }, attributes: ['space_id'] })
        ).map((m) => m.space_id);

        const spaces = await Space.findAll({
            where: {
                visibility: 'public',
                is_archived: false,
                space_id: { [Op.notIn]: memberSpaceIds.length ? memberSpaceIds : ['00000000-0000-0000-0000-000000000000'] },
            },
            include: [
                { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
                { model: SpaceMember, as: 'members', attributes: ['id'] },
            ],
            order: [['created_at', 'DESC']],
            limit,
        });

        return spaces.map((s) => {
            const json = s.toJSON();
            json.participant_count = json.members.length;
            delete json.members;
            return json;
        });
    }

    /**
     * Get spaces the user has joined.
     */
    async getMySpaces(userId, visibility) {
        const where = { user_id: userId };
        const spaceWhere = {};
        if (visibility) spaceWhere.visibility = visibility;

        const memberships = await SpaceMember.findAll({
            where,
            include: [
                {
                    model: Space,
                    where: spaceWhere,
                    include: [
                        { model: User, as: 'creator', attributes: ['user_id', 'username', 'profile_picture'] },
                        { model: Tag, as: 'tags', attributes: ['tag_id', 'tag_name'], through: { attributes: [] } },
                        { model: SpaceMember, as: 'members', attributes: ['id'] },
                    ],
                },
            ],
            order: [[Space, 'created_at', 'DESC']],
        });

        return memberships.map((m) => {
            const json = m.Space.toJSON();
            json.role = m.role;
            json.participant_count = json.members.length;
            delete json.members;
            return json;
        });
    }
}

module.exports = new SpaceService();
