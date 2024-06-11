/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-await-in-loop */
import { gunzipSync } from 'zlib';
import { decode } from 'base16384';
import Logger from 'reggol';

Logger.levels.base = process.env.DEV ? 3 : 2;
Logger.targets[0].showTime = 'dd hh:mm:ss';
Logger.targets[0].label = {
    align: 'right',
    width: 9,
    margin: 1,
};
declare global {
    interface StringConstructor {
        random: (digit?: number, dict?: string) => string;
    }
}

const defaultDict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

String.random = function random(digit = 32, dict = defaultDict) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
    return str;
};

export function Counter<T extends (string | number) = string>() {
    return new Proxy({}, {
        get: (target, prop) => {
            if (target[prop] === undefined) return 0;
            return target[prop];
        },
    }) as Record<T, number>;
}
export function errorMessage(err: Error | string) {
    const t = typeof err === 'string' ? err : err.stack;
    const lines = t.split('\n')
        .filter((i) => !i.includes(' (node:') && !i.includes('(internal'));
    let cursor = 1;
    let count = 0;
    while (cursor < lines.length) {
        if (lines[cursor] !== lines[cursor - 1]) {
            if (count) {
                lines[cursor - 1] += ` [+${count}]`;
                count = 0;
            }
            cursor++;
        } else {
            count++;
            lines.splice(cursor, 1);
        }
    }
    const parsed = lines.join('\n')
        .replace(/[A-Z]:\\.+\\@hydrooj\\/g, '@hydrooj\\')
        .replace(/\/.+\/@hydrooj\//g, '\\')
        .replace(/[A-Z]:\\.+\\hydrooj\\/g, 'hydrooj\\')
        .replace(/\/.+\/hydrooj\//g, 'hydrooj/')
        .replace(/[A-Z]:\\.+\\node_modules\\/g, '')
        .replace(/\/.+\/node_modules\//g, '')
        .replace(/\\/g, '/');
    if (typeof err === 'string') return parsed;
    err.stack = parsed;
    return err;
}
export function isClass(obj: any, strict = false): obj is new (...args: any) => any {
    if (typeof obj !== 'function') return false;
    if (obj.prototype === undefined) return false;
    if (obj.prototype.constructor !== obj) return false;
    if (Object.getOwnPropertyNames(obj.prototype).length >= 2) return true;
    const str = obj.toString();
    if (str.slice(0, 5) === 'class') return true;
    if (/^function\s+\(|^function\s+anonymous\(/.test(str)) return false;
    if (strict && /^function\s+[A-Z]/.test(str)) return true;
    if (/\b\(this\b|\bthis[.[]\b/.test(str)) {
        if (!strict || /classCallCheck\(this/.test(str)) return true;
        return /^function\sdefault_\d+\s*\(/.test(str);
    }
    return false;
}
export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(true), timeout);
    });
}

export * as fs from 'fs-extra';
export * as yaml from 'js-yaml';
export { Logger };

export function StaticHTML(context, randomHash) {
    // eslint-disable-next-line max-len
    return `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>@Hydro/XCPC-TOOLS</title></head><body><div id="root"></div><script>window.Context=JSON.parse('${JSON.stringify(context)}')</script><script src="/main.js?${randomHash}"></script></body></html>`;
}

export function decodeBinary(file: string) {
    if (process.env.NODE_ENV === 'development') return Buffer.from(file, 'base64');
    const buf = decode(file);
    return gunzipSync(buf);
}

export * from './commandRunner';
export * from './printers';
