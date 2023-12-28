import path from 'path';
import Datastore from 'nedb-promises';
import {
    ClientDoc, Context, MonitorDoc, PrintCodeDoc,
} from '../interface';
import { fs, Logger } from '../utils';

const logger = new Logger('db');

fs.ensureDirSync(path.resolve(process.cwd(), 'data/.db'));
const codeDB: Datastore<PrintCodeDoc> = Datastore.create(path.resolve(process.cwd(), 'data/.db/code.db'));
const clientDB: Datastore<ClientDoc> = Datastore.create(path.resolve(process.cwd(), 'data/.db/client.db'));
const monitorDB: Datastore<MonitorDoc> = Datastore.create(path.resolve(process.cwd(), 'data/.db/monitor.db'));

export async function apply(ctx: Context) {
    await codeDB.load();
    await codeDB.ensureIndex({ fieldName: '_id' });
    await codeDB.ensureIndex({ fieldName: 'createAt' });
    await codeDB.ensureIndex({ fieldName: 'done' });
    await codeDB.ensureIndex({ fieldName: 'printer' });
    await codeDB.ensureIndex({ fieldName: 'deleted' });
    logger.info('Code Database loaded');
    await monitorDB.load();
    await monitorDB.ensureIndex({ fieldName: '_id' });
    await monitorDB.ensureIndex({ fieldName: 'mac' });
    await monitorDB.ensureIndex({ fieldName: 'name' });
    await monitorDB.ensureIndex({ fieldName: 'group' });
    logger.info('Monitor Database loaded');
    await clientDB.load();
    await clientDB.ensureIndex({ fieldName: 'id' });
    await clientDB.ensureIndex({ fieldName: 'name' });
    await clientDB.ensureIndex({ fieldName: 'type' });
    await clientDB.ensureIndex({ fieldName: 'group' });
    logger.info('Client Database loaded');
    ctx.db = {
        code: codeDB,
        monitor: monitorDB,
        client: clientDB,
    };
}
