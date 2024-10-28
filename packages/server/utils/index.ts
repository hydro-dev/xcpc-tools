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

export function randomstring(digit = 32, dict = defaultDict) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
    return str;
}
try {
    String.random = randomstring;
} catch (e) { } // Cannot add property random, object is not extensible

export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(true), timeout);
    });
}

// https://github.com/andrasq/node-mongoid-js/blob/master/mongoid.js
export function mongoId(idstring: string) {
    if (typeof idstring !== 'string') idstring = String(idstring);
    return {
        timestamp: parseInt(idstring.slice(0, 0 + 8), 16),
        machineid: parseInt(idstring.slice(8, 8 + 6), 16),
        pid: parseInt(idstring.slice(14, 14 + 4), 16),
        sequence: parseInt(idstring.slice(18, 18 + 6), 16),
    };
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
export * from './color';
export * from './receipt';
export * from './metrics';
