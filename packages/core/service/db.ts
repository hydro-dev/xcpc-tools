import os from 'os';
import path from 'path';
import { fs, Logger } from '@hydrooj/utils';
import initSqlJs from '@minatojs/sql.js';
import { drizzle, SQLJsDatabase } from 'drizzle-orm/sql-js';
import { Context } from '../interface';
import {
    balloons,
    orgs, prints, seats, teams, users,
} from './table';

const logger = new Logger('db');

declare module 'cordis' {
    interface Context {
        db: DatabaseService;
    }
}

export class DatabaseService {
    db: SQLJsDatabase;

    constructor(client) {
        this.db = drizzle(client, { logger: true });
    }

    getUsers(query = {}) {
        return this.db.select(query).from(users);
    }

    getOrgs(query = {}) {
        return this.db.select(query).from(orgs);
    }

    getTeams(query = {}) {
        return this.db.select(query).from(teams);
    }

    getPrints(query = {}) {
        return this.db.select(query).from(prints);
    }

    getSeats(query = {}) {
        return this.db.select(query).from(seats);
    }

    getBalloons(query = {}) {
        return this.db.select(query).from(balloons);
    }
}

export async function apply(ctx: Context) {
    const hydroPath = path.resolve(os.homedir(), '.hydro');
    const [sqlite, buffer] = await Promise.all([
        initSqlJs({
            locateFile: (file) => require.resolve(`@minatojs/sql.js/dist/${file}`),
        }),
        fs.readFile(path.resolve(hydroPath, 'xcpc-tools.db')).catch(() => null),
    ]);
    const client = new sqlite.Database(buffer);
    ctx.db = new DatabaseService(client);
    logger.info('Database load success');
}
