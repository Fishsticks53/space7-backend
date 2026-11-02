const spaceService = require('../services/spaceService');

class SpaceController {
    async create(req, res, next) {
        try {
            const space = await spaceService.createSpace(req.body, req.user.user_id);
            res.status(201).json(space);
        } catch (err) { next(err); }
    }

    async getById(req, res, next) {
        try {
            const space = await spaceService.getSpaceById(req.params.id, req.user.user_id);
            res.json(space);
        } catch (err) { next(err); }
    }

    async join(req, res, next) {
        try {
            const result = await spaceService.joinSpace(req.params.id, req.user.user_id, req.body.invite_code);
            res.json(result);
        } catch (err) { next(err); }
    }

    async generateInvite(req, res, next) {
        try {
            const result = await spaceService.generateInviteCode(req.params.id, req.user.user_id);
            res.status(201).json(result);
        } catch (err) { next(err); }
    }

    async listInviteCodes(req, res, next) {
        try {
            const codes = await spaceService.getInviteCodes(req.params.id, req.user.user_id);
            res.json(codes);
        } catch (err) { next(err); }
    }

    async removeMember(req, res, next) {
        try {
            const result = await spaceService.removeMember(req.params.id, req.user.user_id, req.params.userId);
            res.json(result);
        } catch (err) { next(err); }
    }

    async toggleLock(req, res, next) {
        try {
            const result = await spaceService.toggleLock(req.params.id, req.user.user_id);
            res.json(result);
        } catch (err) { next(err); }
    }

    async archive(req, res, next) {
        try {
            const result = await spaceService.archiveSpace(req.params.id, req.user.user_id);
            res.json(result);
        } catch (err) { next(err); }
    }

    async trending(req, res, next) {
        try {
            const spaces = await spaceService.getTrending(parseInt(req.query.limit) || 10);
            res.json(spaces);
        } catch (err) { next(err); }
    }

    async search(req, res, next) {
        try {
            const spaces = await spaceService.searchSpaces(req.query.q || '', parseInt(req.query.limit) || 20);
            res.json(spaces);
        } catch (err) { next(err); }
    }

    async searchByTag(req, res, next) {
        try {
            const spaces = await spaceService.searchByTag(req.params.tag);
            res.json(spaces);
        } catch (err) { next(err); }
    }

    async recommended(req, res, next) {
        try {
            const spaces = await spaceService.getRecommended(req.user.user_id, parseInt(req.query.limit) || 10);
            res.json(spaces);
        } catch (err) { next(err); }
    }

    async mySpaces(req, res, next) {
        try {
            const spaces = await spaceService.getMySpaces(req.user.user_id, req.query.visibility);
            res.json(spaces);
        } catch (err) { next(err); }
    }
}

module.exports = new SpaceController();
