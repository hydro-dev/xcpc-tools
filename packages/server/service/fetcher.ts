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
        global.Contest = { info: contest, id: contest.id, name: contest.name };
        logger.info(`Connected to ${contest.name}(id=${contest.id})`);
    }

    async teamInfo() {
        const { id } = global.Contest;
        const { body } = await superagent.get(`${global.Tools.config.server}/api/v4/contests/${id}/teams`)
            .set('Authorization', global.Tools.config.token)
            .set('Accept', 'application/json');
        if (!body || !body.length) return;
        const teams = body;
        global.Contest.teams = teams;
        logger.info(`Found ${teams.length} teams`);
    }

    async balloonInfo(all) {
        if (all) logger.info('Sync all balloons...');
        const { id } = global.Tools.contest;
        const { body } = await superagent.get(`${global.Tools.config.server}/api/v4/contests/${id}/balloons?todo=${all ? 'false' : 'true'}`)
            .set('Authorization', global.Tools.config.token)
            .set('Accept', 'application/json');
        if (!body || !body.length) return;
        const balloons = body;
        for (const balloon of balloons) {
            const teamTotal = await global.Tools.db.balloon.find({ teamid: balloon.teamid, time: { $lt: (balloon.time * 1000).toFixed(0) } });
            const totalDict = {};
            for (const t of teamTotal) {
                totalDict[t.problem] = t.contestproblem;
            }
            if (!balloon.done) await this.setBalloonDone(balloon.balloonid);
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
                    awards: balloon.awards,
                    done: balloon.done,
                    total: totalDict,
                    printDone: balloon.done ? 1 : 0,
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
    logger.info('Fetching contest info...');
    try {
        await fetcher!.contestInfo();
        await fetcher!.balloonInfo();
    } catch (e) {
        logger.error(e);
    }
    timer = setTimeout(() => fetchContestInfo(c), 10000);
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
