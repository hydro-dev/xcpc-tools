import receiptline from 'receiptline';
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

export function receiptGenerate(id, location, problem, color, comment, teamname, status) {
    return receiptline.transform(`"^^^^ ID: ${id}

"^^^^ 气球运输单

|^^^座位| ^^^${location} |
|^^^气球| ^^^${problem} |
|^^^颜色| ^^^${color} |
|^^^备注| ^^^${comment} |

-

队伍:${teamname}
队伍当前气球状态:
${status}

=
`);
}

const receipt = receiptGenerate(1, 'A1', '氢气', '白色', '无', 'XCPC-TOOLS', '氢气: 10个, 氦气: 10个');

console.log(receipt);

fs.writeFileSync('/dev/usb/lp0', receipt);
