/* eslint-disable no-await-in-loop */
import superagent from 'superagent';
import { Logger } from '../utils';

const logger = new Logger('fetcher');

class DomJudgeFetcher {
    async contestInfo() {
        const { config: c } = global.Tools;
        const { body } = await superagent.get(`${c.server}/api/v4/contests?onlyActive=true`)
            .set('Authorization', c.token)
            .set('Accept', 'application/json');
        if (!body || !body.length) {
            logger.error('Contest not found');
            return;
        }
        const contest = body[0];
        let freeze = contest.scoreboard_freeze_duration.split(':');
        freeze = parseInt(freeze[0], 10) * 3600 + parseInt(freeze[1], 10) * 60 + parseInt(freeze[2], 10);
        contest.freeze_time = new Date(contest.end_time).getTime() - freeze * 1000;
        global.Tools.contest = { info: contest, id: contest.id, name: contest.name };
        logger.info(`Connected to ${contest.name}(id=${contest.id})`);
    }

    async teamInfo() {
        const { id } = global.Tools.contest;
        const { body } = await superagent.get(`${global.Tools.config.server}/api/v4/contests/${id}/teams`)
            .set('Authorization', global.Tools.config.token)
            .set('Accept', 'application/json');
        if (!body || !body.length) return;
        const teams = body;
        for (const team of teams) {
            await global.Tools.db.teams.update({ id: team.id }, { $set: team }, { upsert: true });
        }
        logger.info(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) logger.info('Sync all balloons...');
        const { id, info } = global.Tools.contest;
        const { body } = await superagent.get(`${global.Tools.config.server}/api/v4/contests/${id}/balloons?todo=${all ? 'false' : 'true'}`)
            .set('Authorization', global.Tools.config.token)
            .set('Accept', 'application/json');
        if (!body || !body.length) return;
        const balloons = body;
        for (const balloon of balloons) {
            const teamTotal = await global.Tools.db.balloon.find({ teamid: balloon.teamid, time: { $lt: (balloon.time * 1000).toFixed(0) } });
            const encourage = teamTotal.length < (global.Tools.config.freezeEncourage ?? 0);
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            const shouldPrint = info.freeze_time ? (balloon.time * 1000) < info.freeze_time || encourage : true;
            if (!shouldPrint && !balloon.done) await this.setBalloonDone(balloon.balloonid);
            await global.Tools.db.balloon.update({ balloonid: balloon.balloonid }, {
                $set: {
                    balloonid: balloon.balloonid,
                    time: (balloon.time * 1000).toFixed(0),
                    problem: balloon.problem,
                    contestproblem: balloon.contestproblem,
                    team: balloon.team,
                    teamid: balloon.teamid,
                    location: balloon.location,
                    affiliation: balloon.affiliation,
                    awards: balloon.awards || (info.freeze_time && (balloon.time * 1000) > info.freeze_time && encourage ? 'Encourage Balloon' : ''),
                    done: balloon.done,
                    total: totalDict,
                    printDone: balloon.done ? 1 : 0,
                    shouldPrint,
                },
            }, { upsert: true });
        }
        logger.info(`Found ${balloons.length} balloons`);
    }

    async setBalloonDone(bid) {
        const { id } = global.Tools.contest;
        await superagent.post(`${global.Tools.config.server}/api/v4/contests/${id}/balloons/${bid}/done`)
            .set('Authorization', global.Tools.config.token)
            .set('Accept', 'application/json');
        logger.info(`Balloon ${bid} set done`);
    }
}

const fetcherList = {
    domjudge: DomJudgeFetcher,
};

let timer: NodeJS.Timeout;

async function fetchContestInfo(c, first = false) {
    if (timer) clearTimeout(timer);
    const fetcher = new fetcherList[c.type]();
    if (c.server.endsWith('/')) c.server = c.server.slice(0, -1);
    logger.info('Fetching contest info...');
    try {
        await fetcher!.contestInfo();
        if (first) await fetcher!.teamInfo();
        await fetcher!.balloonInfo(first);
    } catch (e) {
        logger.error(e);
    }
    timer = setTimeout(() => fetchContestInfo(c), 20000);
    if (first) return fetcher;
    return null;
}

export async function apply(ctx) {
    const { config } = global.Tools;
    if (!config) {
        logger.error('config not found');
        return;
    }
    if (config.token && config.server) {
        ctx.fetcher = await fetchContestInfo(config, true);
    }
}
