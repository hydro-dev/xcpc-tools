/* eslint-disable no-await-in-loop */
import { Context, Service } from 'cordis';
import superagent from 'superagent';
import { config } from '../config';
import { Logger, mongoId, sleep } from '../utils';

const logger = new Logger('fetcher');
const fetch = (url: string, type: 'get' | 'post' = 'get') => {
    const endpoint = new URL(url, config.server).toString();
    let req = superagent[type](endpoint)
        .set('Accept', 'application/json')
        .ok(() => true);
    if (config.token) req = req.set('Authorization', config.token);
    return new Proxy(req, {
        get(target, prop) {
            if (prop === 'then') {
                return (...args) => target.then((res) => {
                    if (![200, 204].includes(res.status)) {
                        logger.error(`Failed to ${type} ${url} : ${res.status} - ${JSON.stringify(res.body || {})}`);
                        throw new Error(`Failed to ${type} ${endpoint} : ${res.status} - ${JSON.stringify(res.body || {})}`);
                    }
                    return res;
                }).then(...args);
            }
            return req[prop];
        },
    });
};
export interface IBasicFetcher {
    contest: Record<string, any>
    cron(): Promise<void>
    contestInfo(): Promise<boolean>
    getToken(username: string, password: string): Promise<void>
    teamInfo(): Promise<void>
    balloonInfo(all: boolean): Promise<void>
    setBalloonDone(bid: string): Promise<void>
}
class BasicFetcher extends Service implements IBasicFetcher {
    contest: any;
    logger = this.ctx.logger('fetcher');

    constructor(ctx: Context) {
        super(ctx, 'fetcher');
    }

    [Service.init]() {
        this.ctx.interval(() => this.cron().catch(this.logger.error), 10000);
    }

    async cron() {
        if (config.type === 'server') return;
        this.logger.info('Fetching contest info...');
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
        return old !== this.contest.id;
    }

    async getToken(username, password) {
        config.token = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }

    async teamInfo() {
        this.logger.debug('Found 0 teams');
    }

    async balloonInfo(all) {
        this.logger.debug(all ? 'Sync all balloons...' : 'Sync new balloons...');
        this.logger.debug('Found 0 balloons in Server Mode');
    }

    async setBalloonDone(bid) {
        this.logger.debug(`Balloon ${bid} set done`);
    }
}

class DOMjudgeFetcher extends BasicFetcher {
    async contestInfo() {
        let contest;
        if (!config.contestId) {
            const { body } = await fetch('./api/v4/contests?onlyActive=true');
            if (!body || !body.length) {
                this.logger.error('Contest not found');
                return false;
            }
            contest = body[0];
        } else {
            const { body } = await fetch(`./api/v4/contests/${config.contestId}`);
            if (!body || !body.id) {
                this.logger.error(`Contest ${config.contestId} not found`);
                return false;
            }
            contest = body;
        }
        let freeze = contest.scoreboard_freeze_duration.split(':');
        freeze = parseInt(freeze[0], 10) * 3600 + parseInt(freeze[1], 10) * 60 + parseInt(freeze[2], 10);
        contest.freeze_time = new Date(contest.end_time).getTime() - freeze * 1000;
        const old = this?.contest?.id;
        this.contest = { info: contest, id: contest.id, name: contest.name };
        this.logger.info(`Connected to ${contest.name}(id=${contest.id})`);
        return old !== this.contest.id;
    }

    async teamInfo() {
        if (!this.ctx.db.teams) await sleep(1000);
        const { body } = await fetch(`./api/v4/contests/${this.contest.id}/teams`);
        if (!body || !body.length) return;
        const teams = body;
        for (const team of teams) {
            await this.ctx.db.teams.update({ id: team.id }, { $set: team }, { upsert: true });
        }
        this.logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) this.logger.info('Sync all balloons...');
        const { body } = await fetch(`./api/v4/contests/${this.contest.id}/balloons?todo=${all ? 'false' : 'true'}`);
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
            if (!shouldPrint && !balloon.done) await this.setBalloonDone(balloon.balloonid.toString());
            await this.ctx.db.balloon.update({ balloonid: balloon.balloonid.toString() }, {
                $set: {
                    balloonid: balloon.balloonid.toString(),
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
        await this.ctx.parallel('balloon/newTask', balloons.length);
        this.logger.debug(`Found ${balloons.length} balloons`);
    }

    async setBalloonDone(bid: string) {
        await fetch(`./api/v4/contests/${this.contest.id}/balloons/${bid}/done`, 'post');
        this.logger.debug(`Balloon ${bid} set done`);
    }
}

class HydroFetcher extends BasicFetcher {
    async contestInfo() {
        const ids = config.contestId.split('/');
        const [domainId, contestId] = ids.length === 2 ? ids : ['system', config.contestId];
        const { body } = await fetch(`/d/${domainId}/contest/${contestId}`);
        if (!body || !body.tdoc) {
            this.logger.error('Contest not found');
            return false;
        }
        const contest = body.tdoc;
        contest.freeze_time = contest.lockAt;
        const old = this?.contest?.id;
        this.contest = {
            info: contest, id: contest._id, name: contest.title, domainId,
        };
        this.logger.info(`Connected to ${this.contest.name}(id=${this.contest.id})`);
        return old !== this.contest.id;
    }

    async getToken(username, password) {
        const res = await fetch('/login', 'post').send({ uname: username, password, rememberme: 'on' }).redirects(0);
        if (!res || res.error) throw new Error('Failed to get token');
        config.token = `Bearer ${res.header['set-cookie'][0].split(';')[0].split('=')[1]}`;
    }

    async teamInfo() {
        const { body } = await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/user`);
        if (!body || !body.length) return;
        const teams = body.tsdocs.filter((t) => body.udict[t.uid]).map((t) => (body.udict[t.uid]));
        for (const team of teams) {
            await this.ctx.db.teams.update({ id: team._id }, { $set: team }, { upsert: true });
        }
        this.logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) this.logger.info('Sync all balloons...');
        const { body } = await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/balloon?todo=${all ? 'false' : 'true'}`);
        if (!body?.bdocs?.length) return;
        for (const balloon of body.bdocs) {
            const teamTotal = await this.ctx.db.balloon.find({ teamid: balloon.uid, time: { $lt: (balloon.time * 1000).toFixed(0) } });
            const encourage = teamTotal.length < (config.freezeEncourage ?? 0);
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const shouldPrint = this.contest.info.freeze_time ? (balloon.time * 1000) < this.contest.info.freeze_time || encourage : true;
            if (!shouldPrint && !balloon.sent) await this.setBalloonDone(balloon.balloonid);
            const contestproblem = {
                id: String.fromCharCode(this.contest.info.pids.indexOf(balloon.pid) + 65),
                name: body.pdict[balloon.pid].title,
                rgb: this.contest.info.balloon[balloon.pid].color,
                color: this.contest.info.balloon[balloon.pid].name,
            };
            await this.ctx.db.balloon.update({ balloonid: balloon._id }, {
                $set: {
                    balloonid: balloon._id,
                    time: mongoId(balloon._id).timestamp,
                    problem: contestproblem.id,
                    contestproblem,
                    team: body.udict[balloon.uid].displayName,
                    teamid: balloon.uid,
                    location: body.udict[balloon.uid].uname,
                    affiliation: body.udict[balloon.uid].school,
                    awards: balloon.first ? 'First of Problem' : (
                        this.contest.info.freeze_time && (balloon.time * 1000) > this.contest.info.freeze_time
                            && encourage ? 'Encourage Balloon' : ''
                    ),
                    done: balloon.sent,
                    total: totalDict,
                    printDone: balloon.sent ? 1 : 0,
                    shouldPrint,
                },
            }, { upsert: true });
        }
        await this.ctx.parallel('balloon/newTask', body.bdocs.length);
        this.logger.debug(`Found ${body.bdocs.length} balloons`);
    }

    async setBalloonDone(bid) {
        await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/balloon`, 'post').send({ operation: 'done', balloon: bid });
        this.logger.debug(`Balloon ${bid} set done`);
    }
}

const fetcherList = {
    server: BasicFetcher,
    domjudge: DOMjudgeFetcher,
    hydro: HydroFetcher,
};

export async function apply(ctx: Context) {
    if (config.type !== 'server') ctx.logger('fetcher').info('Fetch mode:', config.type);
    ctx.plugin(fetcherList[config.type]);
}
