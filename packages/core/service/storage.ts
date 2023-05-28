import { dirname, resolve } from 'path';
import { Readable } from 'stream';
import { URL } from 'url';
import { Logger, streamToBuffer } from '@hydrooj/utils';
import {
    copyFile, createReadStream, ensureDir,
    existsSync, remove, stat, writeFile,
} from 'fs-extra';
import { lookup } from 'mime-types';

const logger = new Logger('storage');
type MaybeArray<T> = T | T[];

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function encodeRFC5987ValueChars(str: string) {
    return (
        encodeURIComponent(str)
            // Note that although RFC3986 reserves "!", RFC5987 does not,
            // so we do not need to escape it
            .replace(/['()]/g, escape) // i.e., %27 %28 %29
            .replace(/\*/g, '%2A')
            // The following are not required for percent-encoding per RFC5987,
            // so we can allow for a little better readability over the wire: |`^
            .replace(/%(?:7C|60|5E)/g, unescape)
    );
}

const convertPath = (p: string) => {
    p = p.trim();
    if (p.includes('..') || p.includes('//') || p.endsWith('/.') || p === '.' || p.includes('/./')) {
        throw new Error('Invalid path');
    }
    return p;
};

class LocalStorageService {
    client: null;
    error: null;
    dir: string;
    opts: null;

    async start() {
        logger.debug('Loading local storage service with path:', './files');
        await ensureDir('./files');
        this.dir = './files';
    }

    async put(target: string, file: string | Buffer | Readable) {
        target = resolve(this.dir, convertPath(target));
        await ensureDir(dirname(target));
        if (typeof file === 'string') await copyFile(file, target);
        else if (file instanceof Buffer) await writeFile(target, file);
        else await writeFile(target, await streamToBuffer(file));
    }

    async get(target: string, path?: string) {
        target = resolve(this.dir, convertPath(target));
        if (!existsSync(target)) throw new Error('File not found');
        if (path) await copyFile(target, path);
        return createReadStream(target);
    }

    async del(target: MaybeArray<string>) {
        const targets = (typeof target === 'string' ? [target] : target).map(convertPath);
        await Promise.all(targets.map((i) => remove(resolve(this.dir, i))));
    }

    async getMeta(target: string) {
        target = resolve(this.dir, convertPath(target));
        const file = await stat(target);
        return {
            size: file.size,
            etag: Buffer.from(target).toString('base64'),
            lastModified: file.mtime,
            metaData: {
                'Content-Type': (target.endsWith('.ans') || target.endsWith('.out'))
                    ? 'text/plain'
                    : lookup(target) || 'application/octet-stream',
                'Content-Length': file.size,
            },
        };
    }

    async signDownloadLink(target: string, filename = '', noExpire = false): Promise<string> {
        target = convertPath(target);
        const url = new URL('https://localhost/storage');
        url.searchParams.set('target', target);
        if (filename) url.searchParams.set('filename', filename);
        const expire = (Date.now() + (noExpire ? 7 * 24 * 3600 : 600) * 1000).toString();
        url.searchParams.set('expire', expire);
        return `/${url.toString().split('localhost/')[1]}`;
    }

    async signUpload() {
        throw new Error('Not implemented');
    }

    async copy(src: string, target: string) {
        src = resolve(this.dir, convertPath(src));
        target = resolve(this.dir, convertPath(target));
        await copyFile(src, target);
        return { etag: target, lastModified: new Date() };
    }
}

export async function loadStorageService() {
    const service = new LocalStorageService();
    await service.start();
}

export default LocalStorageService;
