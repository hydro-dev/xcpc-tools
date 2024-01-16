/* eslint-disable no-await-in-loop */
import { Context } from '../interface';
import { AuthHandler } from './misc';

class BalloonAdminHandler extends AuthHandler {
    async get() {
        const balloons = await this.ctx.db.balloon.find({ shouldPrint: true }).sort({ time: -1 });
        const clients = await this.ctx.db.client.find({ type: 'balloon' }).sort({ createAt: 1 });
        this.response.body = { balloons, clients };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('balloon_admin', '/balloon', BalloonAdminHandler);
}
