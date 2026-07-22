import { Context } from 'cordis';
import { ValidationError } from '@hydrooj/framework';
import { Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/print');

class BalloonAdminHandler extends AuthHandler {
    async get() {
        const balloons = await this.ctx.db.balloon.find({ shouldPrint: true }).sort({ time: -1 });
        this.response.body = { balloons };
    }

    async postReprint(params) {
        const balloon = await this.ctx.db.balloon.findOne({ balloonid: params.balloonid });
        if (!balloon) {
            logger.info(balloon, params.balloonid);
            throw new ValidationError('Balloon', params.balloonid, 'Balloon not found');
        }
        await this.ctx.db.balloon.updateOne({ balloonid: params.balloonid }, {
            $set: {
                printDone: 0,
                printClient: '',
                receivedAt: null,
                printLeaseExpiresAt: null,
            },
        } as any);
        const updated = await this.ctx.db.balloon.findOne({ balloonid: params.balloonid });
        await this.ctx.parallel('notifier/balloonTask', [updated], { name: 'Balloon admin reprint', force: true });
        this.response.body = { success: true };
    }

    async postRetryNotifier(params) {
        const balloon = await this.ctx.db.balloon.findOne({ balloonid: params.balloonid });
        if (!balloon) throw new ValidationError('Balloon', params.balloonid, 'Balloon not found');
        await this.ctx.parallel(
            'notifier/balloonTask',
            [balloon],
            { name: 'Balloon admin retry', retryFailed: true },
        );
        const updated = await this.ctx.db.balloon.findOne({ balloonid: params.balloonid });
        if (updated?.notifierFailed) {
            throw new ValidationError('Notifier', params.balloonid, 'Webhook delivery failed');
        }
        this.response.body = { success: true };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('balloon_admin', '/balloon', BalloonAdminHandler);
}
