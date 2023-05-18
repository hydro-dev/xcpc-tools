import { Logger } from "@hydrooj/utils";
const logger = new Logger('client/runner');

interface balloonInfo {
    taskId: string;
    taskData: string[];
}

interface codeInfo {
    taskId: string;
    filePath: string;
}

async function printBalloon(balloon: balloonInfo) {
    // TODO: print balloon
}

async function printCode(code: codeInfo) {
    // TODO: print code
}

export async function balloon(contest) {
    logger.info('fetching balloons...');
    const res = await this.http.get(`/balloons/${contest.tid}/unsent`);
    if (res.body.error) {
        logger.error(res.body.error);
        return;
    }
    await Promise.all(res.body.balloons.map((balloon) => printBalloon(balloon)));
}

export async function printer(contest) {
    logger.info('fetching codes...');
    const res = await this.http.get(`/printer/${contest.tid}/unsent`);
    if (res.body.error) {
        logger.error(res.body.error);
        return;
    }
    await Promise.all(res.body.codes.map((code) => printCode(code)));
}


export default {
    balloon,
    printer,
};