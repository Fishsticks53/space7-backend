// Private spaces must not leak their messages or details to non-members.
jest.mock('../src/models', () => ({
    Space: { findByPk: jest.fn() },
    SpaceMember: { findOne: jest.fn(), findAll: jest.fn() },
    Message: { findAndCountAll: jest.fn(), count: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
    MessageLike: {},
    User: {},
    Tag: {},
    SpaceTag: {},
    InviteCode: {},
}));
jest.mock('../src/config/cloudinary', () => ({}));
jest.mock('../src/queues/notificationQueue', () => ({ add: jest.fn() }));

const { Space, SpaceMember, Message } = require('../src/models');
const messageService = require('../src/services/messageService');
const spaceService = require('../src/services/spaceService');

const privateSpace = {
    space_id: 's1',
    visibility: 'private',
    toJSON() { return { space_id: 's1', visibility: 'private', members: [] }; },
};
const publicSpace = { ...privateSpace, visibility: 'public', toJSON() { return { space_id: 's1', visibility: 'public', members: [] }; } };

beforeEach(() => {
    jest.clearAllMocks();
    Message.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    Message.count.mockResolvedValue(0);
});

describe('messageService.getMessages', () => {
    test('rejects a non-member reading a private space', async () => {
        Space.findByPk.mockResolvedValue(privateSpace);
        SpaceMember.findOne.mockResolvedValue(null);
        await expect(messageService.getMessages('s1', 'u1', {})).rejects.toMatchObject({ status: 403 });
        expect(Message.findAndCountAll).not.toHaveBeenCalled();
    });

    test('allows a member reading a private space', async () => {
        Space.findByPk.mockResolvedValue(privateSpace);
        SpaceMember.findOne.mockResolvedValue({ user_id: 'u1' });
        await expect(messageService.getMessages('s1', 'u1', {})).resolves.toMatchObject({ messages: [] });
    });

    test('allows anyone reading a public space', async () => {
        Space.findByPk.mockResolvedValue(publicSpace);
        SpaceMember.findOne.mockResolvedValue(null);
        await expect(messageService.getMessages('s1', 'u1', {})).resolves.toMatchObject({ messages: [] });
    });

    test('404s on an unknown space', async () => {
        Space.findByPk.mockResolvedValue(null);
        await expect(messageService.getMessages('s1', 'u1', {})).rejects.toMatchObject({ status: 404 });
    });
});

describe('spaceService.getSpaceById', () => {
    test('rejects a non-member viewing a private space', async () => {
        Space.findByPk.mockResolvedValue(privateSpace);
        SpaceMember.findOne.mockResolvedValue(null);
        await expect(spaceService.getSpaceById('s1', 'u1')).rejects.toMatchObject({ status: 403 });
    });

    test('allows a member viewing a private space', async () => {
        Space.findByPk.mockResolvedValue(privateSpace);
        SpaceMember.findOne.mockResolvedValue({ user_id: 'u1' });
        await expect(spaceService.getSpaceById('s1', 'u1')).resolves.toMatchObject({ space_id: 's1' });
    });
});

describe('messageService.deleteMessage', () => {
    test('a space creator cannot delete a message from a different space', async () => {
        const message = { message_id: 'm1', space_id: 'other-space', sender_id: 'someone', destroy: jest.fn() };
        Message.findByPk.mockResolvedValue(message);
        // The caller is creator of s1 and passes s1 in the URL, but the message lives elsewhere.
        SpaceMember.findOne.mockImplementation(({ where }) =>
            Promise.resolve(where.space_id === 's1' && where.role === 'creator' ? { role: 'creator' } : null));
        await expect(messageService.deleteMessage('m1', 'u1')).rejects.toMatchObject({ status: 403 });
        expect(message.destroy).not.toHaveBeenCalled();
    });
});

describe('messageService.toggleAppreciation', () => {
    test('a non-member cannot appreciate a message in a private space', async () => {
        Message.findByPk.mockResolvedValue({ message_id: 'm1', space_id: 's1', sender_id: 'someone' });
        Space.findByPk.mockResolvedValue(privateSpace);
        SpaceMember.findOne.mockResolvedValue(null);
        await expect(messageService.toggleAppreciation('m1', 'u1')).rejects.toMatchObject({ status: 403 });
    });
});
