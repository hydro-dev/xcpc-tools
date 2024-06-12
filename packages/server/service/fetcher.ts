/* eslint-disable no-await-in-loop */
import { Context, Service } from 'cordis';
import superagent from 'superagent';
import { config } from '../config';
import { Logger } from '../utils';

const logger = new Logger('fetcher');
const fetch = (url: string, type: 'get' | 'post' = 'get') => superagent[type](new URL(url, config.server).toString())
    .set('Authorization', config.token).set('Accept', 'application/json');
export interface IBasicFetcher {
    contest: Record<string, any>
    cron(): Promise<void>
    contestInfo(): Promise<boolean>
    getToken?(username: string, password: string): Promise<void>
    teamInfo?(): Promise<void>
    balloonInfo?(all: boolean): Promise<void>
    setBalloonDone?(bid: string): Promise<void>
}
class BasicFetcher extends Service implements IBasicFetcher {
    contest: any;
    constructor(ctx: Context) {
        super(ctx, 'fetcher', true);
        const interval = setInterval(() => this.cron().catch(logger.error), 20000);
        this.ctx.on('dispose', () => clearInterval(interval));
    }

    async cron() {
        if (config.type === 'server') return;
        logger.info('Fetching contest info...');
        if (!config.token) {
            if (config.username && config.password) await this.getToken(config.username, config.password);
            else throw new Error('No token or username/password provided');
        }
        const first = await this.contestInfo();
        if (first) await this.teamInfo();
        await this.balloonInfo(first);
    }

    async contestInfo() {
        const old = this?.contest?.id;
        this.contest = { name: 'No Contest', id: 'server-mode' };
        return old === this.contest.id;
    }

    async getToken(username, password) {
        config.token = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    async teamInfo() {
        logger.debug('Found 0 teams');
    }

    async balloonInfo(all) {
        logger.debug(all ? 'Sync all balloons...' : 'Sync new balloons...');
        logger.debug('Found 0 balloons in Server Mode');
    }

    async setBalloonDone(bid) {
        logger.debug(`Balloon ${bid} set done`);
    }
}

class DomJudgeFetcher extends BasicFetcher {
    async contestInfo() {
        const { body } = await fetch('/api/v4/contests?onlyActive=true');
        if (!body || !body.length) {
            logger.error('Contest not found');
            return false;
        }
        const contest = body[0];
        let freeze = contest.scoreboard_freeze_duration.split(':');
        freeze = parseInt(freeze[0], 10) * 3600 + parseInt(freeze[1], 10) * 60 + parseInt(freeze[2], 10);
        contest.freeze_time = new Date(contest.end_time).getTime() - freeze * 1000;
        const old = this?.contest?.id;
        this.contest = { info: contest, id: contest.id, name: contest.name };
        logger.info(`Connected to ${contest.name}(id=${contest.id})`);
        return old === this.contest.id;
    }

    async teamInfo() {
        const { body } = await fetch(`/api/v4/contests/${this.contest.id}/teams`);
        if (!body || !body.length) return;
        const teams = body;
        for (const team of teams) {
            await this.ctx.db.teams.update({ id: team.id }, { $set: team }, { upsert: true });
        }
        logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) logger.info('Sync all balloons...');
        const { body } = await fetch(`/api/v4/contests/${this.contest.id}/balloons?todo=${all ? 'false' : 'true'}`);
        if (!body || !body.length) return;
        const balloons = body;
        for (const balloon of balloons) {
            const teamTotal = await this.ctx.db.balloon.find({ teamid: balloon.teamid, time: { $lt: (balloon.time * 1000).toFixed(0) } });
            const encourage = teamTotal.length < (config.freezeEncourage ?? 0);
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const shouldPrint = this.contest.info.freeze_time ? (balloon.time * 1000) < this.contest.info.freeze_time || encourage : true;
            if (!shouldPrint && !balloon.done) await this.setBalloonDone(balloon.balloonid);
            await this.ctx.db.balloon.update({ balloonid: balloon.balloonid }, {
                $set: {
                    balloonid: balloon.balloonid,
                    time: (balloon.time * 1000).toFixed(0),
                    problem: balloon.problem,
                    contestproblem: balloon.contestproblem,
                    team: balloon.team,
                    teamid: balloon.teamid,
                    location: balloon.location,
                    affiliation: balloon.affiliation,
                    awards: balloon.awards || (
                        this.contest.info.freeze_time && (balloon.time * 1000) > this.contest.info.freeze_time
                            && encourage ? 'Encourage Balloon' : ''
                    ),
                    done: balloon.done,
                    total: totalDict,
                    printDone: balloon.done ? 1 : 0,
                    shouldPrint,
                },
            }, { upsert: true });
        }
        logger.debug(`Found ${balloons.length} balloons`);
    }

    async setBalloonDone(bid) {
        await fetch(`/api/v4/contests/${this.contest.id}/balloons/${bid}/done`, 'post');
        logger.debug(`Balloon ${bid} set done`);
    }
}

const fetcherList = {
    server: BasicFetcher,
    domjudge: DomJudgeFetcher,
    hydro: BasicFetcher, // TODO: HydroFetcher
};

export async function apply(ctx) {
    if (config.type !== 'server') {
        logger.info('Fetch mode: ', config.type);
    }
    ctx.provide('fetcher', undefined, true);
    ctx.fetcher = await new fetcherList[config.type](ctx);
}
