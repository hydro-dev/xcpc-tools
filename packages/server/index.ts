import os from 'os';
import path from 'path';
import { Context } from './interface';
import { fs, Logger } from './utils';

Logger.levels.base = 3;

const logger = new Logger('tools');

require('./init').load();
process.on('unhandledRejection', (e) => { logger.error(e); });
process.on('uncaughtException', (e) => { logger.error(e); });
Error.stackTraceLimit = 50;
global.app = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');

async function apply(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    require('./error');
    await require('./service/server').apply(ctx);
    await require('./service/db').apply(ctx);
    if (global.Tools.config.type !== 'server') {
        logger.info('Fetch mode: ', global.Tools.config.type);
        await require('./service/fetcher').apply(ctx);
    }
    await require('./handler/misc').apply(ctx);
    await require('./handler/printer').apply(ctx);
    await require('./handler/monitor').apply(ctx);
    await require('./handler/client').apply(ctx);
    await require('./handler/balloon').apply(ctx);
    await require('./handler/commands').apply(ctx);
    await ctx.lifecycle.flush();
    await ctx.parallel('app/started');
    logger.success('Server started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

apply(global.app);
