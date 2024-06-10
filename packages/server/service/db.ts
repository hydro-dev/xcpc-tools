import path from 'path';
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
        super(ctx, 'dbservice', true);
        ctx.mixin('dbservice', ['db']);
    }

    db: { [T in keyof Collections]: Datastore<Collections[T]> };

    async initDatabase(key: string, fields: string[]) {
        this.db[key] = Datastore.create(path.resolve(process.cwd(), `data/.db/${key}.db`));
        await this[key].load();
        // eslint-disable-next-line no-await-in-loop
        for (const field of fields) await this[key].ensureIndex({ fieldName: field });
        this.ctx.logger('db').info(`${key} Database loaded`);
    }

    async start() {
        await this.initDatabase('codeDB', ['_id', 'createAt', 'done', 'printer', 'deleted']);
        await this.initDatabase('monitorDB', ['_id', 'mac', 'name', 'group']);
        await this.initDatabase('clientDB', ['id', 'name', 'type', 'group']);
        await this.initDatabase('balloonDB', ['id', 'time', 'problem', 'teamid', 'awards', 'done', 'printDone']);
        await this.initDatabase('teamsDB', []);
    }
}
