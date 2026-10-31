/* eslint-disable no-await-in-loop */
import path from 'node:path';
import { Context, Service } from 'cordis';
import superagent from 'superagent';
import { config } from '../config';
import type { BalloonDoc } from '../interface';
import {
    fs, Logger, mongoId, sleep,
} from '../utils';
import { extractHydroTeams, resolvePublicAssetUrl } from './presentation';

const logger = new Logger('fetcher');
const fetch = (url: string, type: 'get' | 'post' = 'get') => {
    const endpoint = new URL(url, config.server).toString();
    let req = superagent[type](endpoint)
        .set('Accept', 'application/json')
        .set('User-Agent', 'Hydro/XCPC-Tools')
        .ok(() => true);
    if (config.token) req = req.set('Authorization', config.token).set('Cookie', config.token);
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
    sourceSuccessAt: number
    sourceErrorAt: number
    sourceError: string
    cron(): Promise<void>
    contestInfo(): Promise<boolean>
    getToken(username: string, password: string): Promise<void>
    teamInfo(): Promise<void>
    balloonInfo(all: boolean): Promise<void>
    setBalloonDone(bid: string): Promise<void>
    setPrintDone(pid: string): Promise<void>
}
class BasicFetcher extends Service implements IBasicFetcher {
    contest: any;
    lastSuccessAt = 0;
    lastErrorAt = 0;
    lastError = '';
    sourceSuccessAt = 0;
    sourceErrorAt = 0;
    sourceError = '';
    lastTeamSyncAt = 0;
    logger = this.ctx.logger('fetcher');

    constructor(ctx: Context) {
        super(ctx, 'fetcher');
    }

    [Service.init]() {
        this.ctx.interval(async () => {
            try {
                await this.cron();
                if (config.type !== 'server') {
                    this.lastSuccessAt = Date.now();
                    this.lastError = '';
                }
            } catch (error) {
                this.lastErrorAt = Date.now();
                this.lastError = error instanceof Error ? error.message : String(error);
                this.logger.error(error);
            }
        }, 15000);
    }

    async cron() {
        if (config.type === 'server') return;
        if (!config.token) {
            if (config.username && config.password) await this.getToken(config.username, config.password);
            else throw new Error('No token or username/password provided');
        }
        const pendingPrintAcks = await this.ctx.db.code.find({
            done: 1,
            id: { $exists: true, $nin: ['', null] },
            $or: [
                { remoteDoneAt: { $exists: false } },
                { remoteDoneAt: null },
            ],
        });
        for (const code of pendingPrintAcks) {
            try {
                await this.setPrintDone(code.id!);
                await this.ctx.db.code.updateOne({ _id: code._id }, { $set: { remoteDoneAt: Date.now() } });
            } catch (error) {
                this.logger.error(`Failed to confirm print task ${code.id}`, error);
            }
        }
        this.logger.info('Fetching contest info...');
        let first = false;
        try {
            first = await this.contestInfo();
            if (first || Date.now() - this.lastTeamSyncAt > 5 * 60_000) {
                await this.teamInfo();
                this.lastTeamSyncAt = Date.now();
            }
            this.sourceSuccessAt = Date.now();
            this.sourceError = '';
        } catch (error) {
            this.sourceErrorAt = Date.now();
            this.sourceError = error instanceof Error ? error.message : String(error);
            throw error;
        }
        await this.balloonInfo(first);
        await this.printInfo(first);
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

    async printInfo(_all) {
        this.logger.debug('Found 0 prints in Server Mode');
    }

    async setPrintDone(pid) {
        this.logger.debug(`Print ${pid} set done`);
    }
}

class DOMjudgeFetcher extends BasicFetcher {
    async contestInfo() {
        let contest;
        if (!config.contestId) {
            const { body } = await fetch('./api/v4/contests?onlyActive=true');
            if (!body || !body.length) {
                throw new Error('Contest not found');
            }
            contest = body[0];
        } else {
            const { body } = await fetch(`./api/v4/contests/${config.contestId}`);
            if (!body || !body.id) {
                throw new Error(`Contest ${config.contestId} not found`);
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
        const [{ body }, organizationResponse] = await Promise.all([
            fetch(`./api/v4/contests/${this.contest.id}/teams`),
            fetch(`./api/v4/contests/${this.contest.id}/organizations`).catch((error) => {
                this.logger.warn('Unable to load DOMjudge organizations: %s', error.message);
                return { body: [] };
            }),
        ]);
        if (!Array.isArray(body)) throw new Error('DOMjudge returned an invalid team list');
        if (!body.length) {
            // shortcut: OJ 空名单多为接口异常,清空会让气球同步全部跳过,保留本地名单
            this.logger.warn('DOMjudge returned an empty team list, keeping local teams');
            return;
        }
        const teams = body;
        await this.ctx.db.teams.remove({ id: { $nin: teams.map((team) => team.id) } }, { multi: true });
        const organizations = new Map((organizationResponse.body || []).map((organization) => [String(organization.id), organization]));
        for (const team of teams) {
            const organization: any = organizations.get(String(team.organization_id));
            const school = organization?.formal_name || organization?.name || team.affiliation || team.organization_id || '';
            const logo = resolvePublicAssetUrl(
                organization?.logo || organization?.logo_url || organization?.avatar,
                config.server,
            );
            await this.ctx.db.teams.update({ id: team.id }, {
                $set: {
                    ...team,
                    ...school && { school, affiliation: school },
                    ...logo && { logo },
                },
            }, { upsert: true });
        }
        this.logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) this.logger.info('Sync all balloons...');
        const { body } = await fetch(`./api/v4/contests/${this.contest.id}/balloons?todo=${all ? 'false' : 'true'}`);
        if (!body || !body.length) return;
        const balloons = body.sort((a, b) => a.time - b.time);
        const pending: BalloonDoc[] = [];
        for (const balloon of balloons) {
            const teamTotal = await this.ctx.db.balloon.find({ teamid: balloon.teamid, time: { $lt: (balloon.time * 1000).toFixed(0) } });
            const encourage = teamTotal.length < (config.freezeEncourage ?? 0);
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const shouldPrint = this.contest.info.freeze_time ? (balloon.time * 1000) < this.contest.info.freeze_time || encourage : true;
            if (!shouldPrint && !balloon.done) await this.setBalloonDone(balloon.balloonid.toString());
            const hasFirst = await this.ctx.db.balloon.findOne({ problem: balloon.problem, time: { $lt: (balloon.time * 1000).toFixed(0) }, team: { $ne: 'domjudge' } }); // skip import gen balloon for first of problem 
            const updated = await this.ctx.db.balloon.updateOne({ balloonid: balloon.balloonid.toString() }, {
                $set: {
                    balloonid: balloon.balloonid.toString(),
                    time: (balloon.time * 1000).toFixed(0),
                    problem: balloon.problem,
                    contestproblem: {
                        ...balloon.contestproblem,
                        color: null,
                    },
                    team: balloon.team,
                    teamid: balloon.teamid,
                    location: balloon.location,
                    affiliation: balloon.affiliation,
                    awards: balloon.awards || (
                        !hasFirst ? 'First of Problem' : (
                            this.contest.info.freeze_time && (balloon.time * 1000) > this.contest.info.freeze_time
                                && encourage ? 'Encourage Balloon' : ''
                        )
                    ),
                    done: balloon.done,
                    total: totalDict,
                    printDone: balloon.done ? 1 : 0,
                    shouldPrint,
                },
            }, { upsert: true, returnUpdatedDocs: true });
            if (!updated.done) pending.push(updated);
        }
        await this.ctx.parallel('balloon/newTask', balloons.length);
        this.ctx.parallel('notifier/balloonTask', pending, { name: 'Contest sync' })
            .catch((error) => this.logger.error(error));
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
            throw new Error('Contest not found');
        }
        const contest = body.tdoc;
        contest.freeze_time = contest.lockAt;
        delete contest.content;
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
        const teams = extractHydroTeams(body);
        if (!teams.length) {
            // shortcut: OJ 空名单多为接口异常,清空会让气球同步全部跳过,保留本地名单
            this.logger.warn('Hydro returned an empty team list, keeping local teams');
            return;
        }
        await this.ctx.db.teams.remove({ id: { $nin: teams.map((team) => team._id) } }, { multi: true });
        for (const team of teams) {
            const { _id: teamId, ...teamData } = team;
            const logo = resolvePublicAssetUrl(team.schoolLogo || team.logo || team.avatar, config.server);
            await this.ctx.db.teams.update({ id: teamId }, {
                $set: {
                    ...teamData,
                    id: teamId,
                    ...logo && { logo },
                },
            }, { upsert: true });
        }
        this.logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) this.logger.info('Sync all balloons...');
        const { body } = await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/balloon?todo=${all ? 'false' : 'true'}`);
        if (!body?.bdocs?.length) return;
        const baloons = body.bdocs.map((b) => ({ ...b, time: mongoId(b._id).timestamp * 1000 })).sort((a, b) => a.time - b.time);
        const pending: BalloonDoc[] = [];
        for (const balloon of baloons) {
            const teamTotal = await this.ctx.db.balloon.find({ teamid: balloon.uid, time: { $lt: balloon.time } });
            const encourage = teamTotal.length < (config.freezeEncourage ?? 0);
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const shouldPrint = this.contest.info.freeze_time ? balloon.time < new Date(this.contest.info.freeze_time).getTime() || encourage : true;
            if (!shouldPrint && !balloon.sent) await this.setBalloonDone(balloon._id);
            const contestproblem = {
                id: balloon.pid.toString(),
                short_name: String.fromCharCode(this.contest.info.pids.indexOf(balloon.pid) + 65),
                name: body.pdict[balloon.pid].title,
                rgb: this.contest.info.balloon[balloon.pid].color,
                color: this.contest.info.balloon[balloon.pid].name,
            };
            const udoc = body.udict[balloon.uid];
            const updated = await this.ctx.db.balloon.updateOne({ balloonid: balloon._id }, {
                $set: {
                    balloonid: balloon._id,
                    time: balloon.time,
                    problem: contestproblem.short_name,
                    contestproblem,
                    team: udoc.displayName || udoc.uname,
                    teamid: balloon.uid,
                    location: udoc.seat || udoc.studentId,
                    affiliation: udoc.school,
                    awards: balloon.first ? 'First of Problem' : (
                        this.contest.info.freeze_time && (balloon.time * 1000) > this.contest.info.freeze_time
                            && encourage ? 'Encourage Balloon' : ''
                    ),
                    done: balloon.sent,
                    total: totalDict,
                    printDone: balloon.sent ? 1 : 0,
                    shouldPrint,
                },
            }, { upsert: true, returnUpdatedDocs: true });
            if (!updated.done) pending.push(updated);
        }
        await this.ctx.parallel('balloon/newTask', body.bdocs.length);
        this.ctx.parallel('notifier/balloonTask', pending, { name: 'Contest sync' })
            .catch((error) => this.logger.error(error));
        this.logger.debug(`Found ${body.bdocs.length} balloons`);
    }

    async setBalloonDone(bid) {
        await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/balloon`, 'post').send({ operation: 'done', balloon: bid });
        this.logger.debug(`Balloon ${bid} set done`);
    }

    async printInfo(_all) {
        const doFetch = async () => {
            const { body } = await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/print`, 'post')
                .send({ operation: 'allocate_print_task' });
            return body;
        };
        let { task, udoc } = await doFetch();
        let cnt = 0;
        while (task) {
            await fs.ensureDir(path.resolve(process.cwd(), 'data/codes'));
            const res = await this.ctx.db.code.insert({
                id: task._id,
                tid: task.owner,
                team: `${udoc.school ? `${udoc.school}: ` : ''}${udoc.displayName || udoc.uname}`,
                location: udoc.seat || udoc.studentId,
                filename: task.title,
                lang: task.title.split('.').pop() || 'txt',
                createAt: new Date(parseInt(task._id.substring(0, 8), 16) * 1000).getTime(),
                printer: '',
                done: task.status === 'printed' ? 1 : 0,
            });
            try {
                await fs.writeFile(path.resolve(process.cwd(), 'data/codes', `${task.owner}#${res._id}`), task.content);
            } catch (error) {
                await this.ctx.db.code.removeOne({ _id: res._id }, {});
                throw error;
            }
            logger.info(`Team(${task.owner}): ${udoc.displayName || udoc.uname} submitted code. Code Print ID: ${task.owner}#${res._id}`);
            cnt++;
            ({ task, udoc } = await doFetch());
        }
        await this.ctx.parallel('print/newTask', cnt);
    }

    async setPrintDone(pid) {
        await fetch(`/d/${this.contest.domainId}/contest/${this.contest.id}/print`, 'post')
            .send({ operation: 'update_print_task', taskId: pid, status: 'printed' });
        this.logger.debug(`Print ${pid} set done`);
    }
}

class CCSFetcher extends BasicFetcher {
    async contestInfo() {
        if (!config.contestId) throw new Error('Contest ID is required');
        const { body: contest } = await fetch(`/api/contests/${config.contestId}`);
        if (!contest || !contest.id) throw new Error(`Contest ${config.contestId} not found`);
        let duration = contest.duration.split(':');
        duration = parseInt(duration[0], 10) * 3600 + parseInt(duration[1], 10) * 60 + parseInt(duration[2], 10);
        contest.end_time = new Date(contest.start_time).getTime() + duration * 1000;
        let freeze = contest.scoreboard_freeze_duration.split(':');
        freeze = parseInt(freeze[0], 10) * 3600 + parseInt(freeze[1], 10) * 60 + parseInt(freeze[2], 10);
        contest.freeze_time = new Date(contest.end_time).getTime() - freeze * 1000;
        const old = this?.contest?.id;
        this.contest = { info: contest, id: contest.id, name: contest.name };
        this.logger.info(`Connected to ${contest.name}(id=${contest.id})`);
        return old !== this.contest.id;
    }

    async teamInfo() {
        const { body: teams } = await fetch(`/api/contests/${this.contest.id}/teams`);
        if (!teams || !teams.length) {
            // shortcut: OJ 空名单多为接口异常,清空会让气球同步全部跳过,保留本地名单
            this.logger.warn('CCS returned an empty team list, keeping local teams');
            return;
        }
        await this.ctx.db.teams.remove({ id: { $nin: teams.map((t) => t.id) } }, { multi: true });
        for (const team of teams) {
            // if (!team.name.includes('\u003Cb\u003E')) continue;
            await this.ctx.db.teams.update({ id: team.id }, {
                $set: {
                    ...team,
                    id: team.id,
                    name: team.name.trim(),
                    affiliation: team.name.trim(),
                },
            }, { upsert: true });
        }
        this.logger.debug(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) this.logger.info('Sync all balloons...');
        const { body: problems } = await fetch(`/api/contests/${this.contest.id}/problems`);
        if (!problems || !problems.length) return;
        const problemDict = Object.fromEntries(problems.map((p) => [p.id, p]));
        const teams = await this.ctx.db.teams.find({});
        if (!teams || !teams.length) return;
        const teamDict = Object.fromEntries(teams.map((t) => [t.id, t]));
        const { body: judgements } = await fetch(`/api/contests/${this.contest.id}/judgements`);
        if (!judgements || !judgements.length) return;
        const judgeDict = Object.fromEntries(judgements.map((j) => [j.submission_id, j.judgement_type_id]));
        let submissions: any[] = [];
        const { body } = await fetch(`/api/contests/${this.contest.id}/submissions`);
        if (!body || !body.length) return;
        submissions = body.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
        const pending: BalloonDoc[] = [];
        for (const submission of submissions) {
            const judgement = judgeDict[submission.id];
            const problem = problemDict[submission.problem_id];
            if (!judgement || judgement !== 'AC' || !problem || !teamDict[submission.team_id]) continue;
            submission.time = new Date(submission.time).getTime();
            if (!this.contest.info.freeze_time || submission.time >= this.contest.info.freeze_time) continue;
            const teamAlreadyBalloon = await this.ctx.db.balloon.findOne({ teamid: submission.team_id, problem: problem.label });
            if (teamAlreadyBalloon) continue;
            const teamTotal = await this.ctx.db.balloon.find({ teamid: submission.team_id, time: { $lt: submission.time } });
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const problemTotal = await this.ctx.db.balloon.find({ problem: problem.label, time: { $lt: submission.time } });
            const firstProblem = problemTotal.length < 1 ? 'First of Problem' : '';
            const updated = await this.ctx.db.balloon.updateOne({ balloonid: submission.id.toString() }, {
                $set: {
                    balloonid: submission.id.toString(),
                    time: submission.time,
                    problem: problem.label,
                    contestproblem: {
                        id: problem.id,
                        short_name: problem.label,
                        name: problem.name,
                        rgb: '#000000',
                        color: '见现场',
                    },
                    team: teamDict[submission.team_id].name,
                    teamid: submission.team_id,
                    location: submission.team_id,
                    affiliation: teamDict[submission.team_id].affiliation,
                    awards: firstProblem,
                    total: totalDict,
                    shouldPrint: true,
                    done: 0,
                    printDone: 0,
                },
            }, { upsert: true, returnUpdatedDocs: true });
            if (!updated.done) pending.push(updated);
        }
        await this.ctx.parallel('balloon/newTask', pending.length);
        this.ctx.parallel('notifier/balloonTask', pending, { name: 'Contest sync' })
            .catch((error) => this.logger.error(error));
        this.logger.debug(`Found ${pending.length} balloons`);
    }

    async setBalloonDone(bid: string) {
        await this.ctx.db.balloon.updateOne(
            { balloonid: bid },
            { $set: { done: 1 } },
        );
    }
}

const fetcherList = {
    server: BasicFetcher,
    domjudge: DOMjudgeFetcher,
    hydro: HydroFetcher,
    ccs: CCSFetcher,
};

export async function apply(ctx: Context) {
    if (config.type !== 'server') ctx.logger('fetcher').info('Fetch mode:', config.type);
    ctx.plugin(fetcherList[config.type]);
}
