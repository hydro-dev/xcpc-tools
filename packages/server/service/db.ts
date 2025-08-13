import path from 'node:path';
import { Context, Service } from 'cordis';
import Datastore from 'nedb-promises';
import {
    BalloonDoc, ClientDoc, MonitorDoc, PrintCodeDoc, TeamDoc,
} from '../interface';
import { fs } from '../utils';

export interface Collections {
    code: PrintCodeDoc;
    monitor: MonitorDoc;
    client: ClientDoc;
    balloon: BalloonDoc;
    teams: TeamDoc;
}

declare module 'cordis' {
    interface Context {
        dbservice: DBService;
        db: DBService['db'];
    }
}

export default class DBService extends Service {
    constructor(ctx: Context) {
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/.db'));
        super(ctx, 'dbservice');
        ctx.mixin('dbservice', ['db']);
    }

    db: { [T in keyof Collections]: Datastore<Collections[T]> } = {} as any;

    async initDatabase(key: string, fields: string[]) {
        this.db[key] = Datastore.create(path.resolve(process.cwd(), `data/.db/${key}.db`));
        await this.db[key].load();
        // eslint-disable-next-line no-await-in-loop
        for (const field of fields) await this.db[key].ensureIndex({ fieldName: field });
        this.ctx.logger('db').info(`${key} Database loaded`);
    }

    async [Service.init]() {
        await this.initDatabase('code', ['_id', 'createAt', 'done', 'printer', 'deleted']);
        await this.initDatabase('monitor', ['_id', 'mac', 'name', 'group']);
        await this.initDatabase('client', ['id', 'name', 'type', 'group']);
        await this.initDatabase('balloon', ['id', 'time', 'problem', 'teamid', 'awards', 'done', 'printDone']);
        await this.initDatabase('teams', []);
    }
}
