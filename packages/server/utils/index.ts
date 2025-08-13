import { gunzipSync } from 'node:zlib';
import { decode } from 'base16384';

export { Logger, sleep, randomstring } from '@hydrooj/utils';

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

export function StaticHTML(context, randomHash) {
    // eslint-disable-next-line max-len
    return `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>@Hydro/XCPC-TOOLS</title></head><body><div id="root"></div><script>window.Context=JSON.parse('${JSON.stringify(context)}')</script><script src="/main.js?${randomHash}"></script></body></html>`;
}

export function decodeBinary(file: string, name: string) {
    if (process.env.NODE_ENV === 'development') return Buffer.from(file, 'base64');
    if ('Deno' in globalThis) return globalThis.Deno.readFileSync(name);
    const buf = decode(file);
    return gunzipSync(buf);
}

export * from './commandRunner';
export * from './printers';
export * from './color';
export * from './receipt';
export * from './metrics';
