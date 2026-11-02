const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');
const assertSpaceReadable = require('../utils/assertSpaceReadable');

let io;

function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // Authentication middleware
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = verifyToken(token);
            socket.userId = decoded.user_id;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.userId}`);

        // Join a space room. Private rooms are members only, otherwise anyone
        // could listen in on receive_message broadcasts.
        socket.on('join_space', async (spaceId, ack) => {
            try {
                await assertSpaceReadable(spaceId, socket.userId);
                socket.join(`space:${spaceId}`);
                if (typeof ack === 'function') ack({ ok: true });
            } catch (err) {
                if (typeof ack === 'function') ack({ ok: false, error: err.message });
            }
        });

        // Leave a space room
        socket.on('leave_space', (spaceId) => {
            socket.leave(`space:${spaceId}`);
        });

        // receive_message and message_appreciated are emitted by the REST
        // controllers after the database write. Clients are not allowed to
        // emit them, since a relayed payload could impersonate any user.

        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.userId}`);
        });
    });

    return io;
}

function getIO() {
    if (!io) throw new Error('Socket.IO not initialised');
    return io;
}

module.exports = { initSocket, getIO };
