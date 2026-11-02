describe('utils/jwt', () => {
    const original = process.env.JWT_SECRET;
    afterEach(() => {
        process.env.JWT_SECRET = original;
        jest.resetModules();
    });

    test('refuses to load without JWT_SECRET instead of using a default', () => {
        delete process.env.JWT_SECRET;
        expect(() => require('../src/utils/jwt')).toThrow(/JWT_SECRET/);
    });

    test('signs and verifies with JWT_SECRET', () => {
        process.env.JWT_SECRET = 'test-secret';
        const { signToken, verifyToken } = require('../src/utils/jwt');
        expect(verifyToken(signToken({ user_id: 'u1' })).user_id).toBe('u1');
    });
});
