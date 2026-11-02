const messageService = require('../services/messageService');
const { getIO } = require('../sockets/socketServer');

class MessageController {
    async send(req, res, next) {
        try {
            const message = await messageService.sendMessage({
                spaceId: req.params.spaceId,
                senderId: req.user.user_id,
                content: req.body.content,
                file: req.file || null,
                mediaType: req.body.media_type || null,
            });
            getIO().to(`space:${req.params.spaceId}`).emit('receive_message', message);
            res.status(201).json(message);
        } catch (err) { next(err); }
    }

    async list(req, res, next) {
        try {
            const result = await messageService.getMessages(req.params.spaceId, req.user.user_id, {
                sort: req.query.sort,
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
            });
            res.json(result);
        } catch (err) { next(err); }
    }

    async appreciate(req, res, next) {
        try {
            const result = await messageService.toggleAppreciation(req.params.messageId, req.user.user_id);
            getIO().to(`space:${req.params.spaceId}`).emit('message_appreciated', {
                messageId: req.params.messageId,
                appreciated: result.appreciated,
                userId: req.user.user_id,
            });
            res.json(result);
        } catch (err) { next(err); }
    }

    async remove(req, res, next) {
        try {
            const result = await messageService.deleteMessage(req.params.messageId, req.user.user_id, req.params.spaceId);
            res.json(result);
        } catch (err) { next(err); }
    }
}

module.exports = new MessageController();
