// Another user's profile must not expose their email address.
jest.mock('../src/models', () => ({
    User: { findByPk: jest.fn() },
    Space: { count: jest.fn(), findAll: jest.fn() },
    SpaceMember: { count: jest.fn() },
    Message: { sum: jest.fn(), findAll: jest.fn() },
    MessageLike: { count: jest.fn() },
}));
jest.mock('../src/config/cloudinary', () => ({}));

const { User, Space, SpaceMember, Message } = require('../src/models');
const profileService = require('../src/services/profileService');

beforeEach(() => {
    const user = { user_id: 'u2', username: 'bob', email: 'bob@example.com', bio: null, profile_picture: null };
    User.findByPk.mockResolvedValue({ toJSON: () => ({ ...user }) });
    Space.count.mockResolvedValue(0);
    Space.findAll.mockResolvedValue([]);
    SpaceMember.count.mockResolvedValue(0);
    Message.sum.mockResolvedValue(0);
    Message.findAll.mockResolvedValue([]);
});

test('getPublicProfile leaves out the email', async () => {
    const profile = await profileService.getPublicProfile('u2');
    expect(profile.username).toBe('bob');
    expect(profile).not.toHaveProperty('email');
});

test('getProfile (own profile) still includes the email', async () => {
    const profile = await profileService.getProfile('u2');
    expect(profile.email).toBe('bob@example.com');
});
