const { Space, SpaceMember } = require('../models');

/**
 * Load a space the user is allowed to read: any public space, or a private
 * space they are a member of. Throws 404/403 otherwise.
 */
async function assertSpaceReadable(spaceId, userId) {
    const space = await Space.findByPk(spaceId);
    if (!space) throw Object.assign(new Error('Space not found'), { status: 404 });

    if (space.visibility === 'private') {
        const membership = await SpaceMember.findOne({ where: { space_id: spaceId, user_id: userId } });
        if (!membership) throw Object.assign(new Error('This space is private'), { status: 403 });
    }

    return space;
}

module.exports = assertSpaceReadable;
