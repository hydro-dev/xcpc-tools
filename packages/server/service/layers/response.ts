import { SystemError, UserFacingError } from '../../error';
import { errorMessage } from '../../utils';
import type { KoaContext } from '../server';

export default (router, logger) => async (ctx: KoaContext, next) => {
    const { request, response } = ctx.HydroContext;
    ctx.getUrl = (name: string, ...kwargsList: Record<string, any>[]) => {
        if (name === '#') return '#';
        let res = '#';
        const args: any = {};
        const query: any = {};
        for (const kwargs of kwargsList) {
            for (const key in kwargs) args[key] = kwargs[key].toString().replace(/\//g, '%2F');
            for (const key in kwargs.query || {}) query[key] = kwargs.query[key].toString();
        }
        try {
            const { anchor } = args;
            res = router.url(name, args, { query }).toString();
            if (anchor) res = `${res}#${anchor}`;
        } catch (e) {
            logger.warn(e.message);
            logger.info('%s %o', name, args);
            if (!e.message.includes('Expected') || !e.message.includes('to match')) logger.info('%s', e.stack);
        }
        return res;
    };
    try {
        await next();
        if (response.redirect) {
            response.body ||= {};
            response.body.url = response.redirect;
        }
        if (!response.type) {
            try {
                response.body = JSON.stringify(response.body);
            } catch (e) {
                response.body = new SystemError('Serialize failure', e.message);
            }
            response.type = 'application/json';
        }
        if (response.disposition) ctx.set('Content-Disposition', response.disposition);
        if (response.etag) {
            ctx.set('ETag', response.etag);
            ctx.set('Cache-Control', 'public');
        }
    } catch (err) {
        logger.error(err);
        const error = errorMessage(err);
        response.status = error instanceof UserFacingError ? error.code : 500;
        response.body = { error };
    } finally {
        if (response.etag && request.headers['if-none-match'] === response.etag) {
            ctx.response.status = 304;
        } else if (response.redirect && !request.json) {
            ctx.response.type = 'application/octet-stream';
            ctx.response.status = 302;
            ctx.redirect(response.redirect);
        } else if (response.body) {
            ctx.body = response.body;
            ctx.response.status = response.status || 200;
            ctx.response.type = response.type
                || (request.json
                    ? 'application/json'
                    : ctx.response.type);
        }
    }
};
