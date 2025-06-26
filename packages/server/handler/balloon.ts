import { Context } from 'cordis';
import { ValidationError } from '@hydrooj/framework';
import { Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/print');

class BalloonAdminHandler extends AuthHandler {
    async get() {
        const balloons = await this.ctx.db.balloon.find({ shouldPrint: true }).sort({ time: -1 });
        const clients = await this.ctx.db.client.find({ type: 'balloon' }).sort({ createAt: 1 });
        this.response.body = { balloons, clients };
    }

    async postReprint(params) {
        const balloon = await this.ctx.db.balloon.findOne({ balloonid: params.balloonid });
        if (!balloon) {
            logger.info(balloon, params.balloonid);
            throw new ValidationError('Balloon', params.balloonid, 'Balloon not found');
        }
        await this.ctx.db.balloon.updateOne({ balloonid: params.balloonid }, { $set: { printDone: 0 } });
        this.response.body = { success: true };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('balloon_admin', '/balloon', BalloonAdminHandler);
}
