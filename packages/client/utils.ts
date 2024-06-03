import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import Logger from 'reggol';

Logger.levels.base = process.env.DEV ? 3 : 2;
Logger.targets[0].showTime = 'dd hh:mm:ss';
Logger.targets[0].label = {
    align: 'right',
    width: 9,
    margin: 1,
};

export * as fs from 'fs-extra';
export * as yaml from 'js-yaml';
export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(true), timeout);
    });
}
export { Logger };

const encoder = new EscPosEncoder();

export const receiptText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string,
) => encoder
    .initialize()
    .codepage('cp936')
    .align('center')
    .bold(true)
    .size(2, 2)
    .line('气球打印单')
    .line(`ID: ${id}`)
    .bold(false)
    .size(0)
    .line('================================')
    .line(`座位: ${location}`)
    .line(`气球: ${problem}`)
    .line(`颜色: ${color}`)
    .line(`备注: ${comment}`)
    .line('================================')
    .emptyLine(2)
    .line(`队伍: ${teamname}`)
    .line('队伍当前气球状态:')
    .line(`${status}`)
    .emptyLine(2)
    .line('Powered by hydro-dev/xcpc-tools')
    .emptyLine(3)
    .cut()
    .encode();
