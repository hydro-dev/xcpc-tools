import * as fs from 'fs';
import * as path from 'path';
import { preloadFontAssets } from '@myriaddreamin/typst.ts/dist/cjs/options.init.cjs';
import { HttpsProxyAgent } from 'https-proxy-agent';

const extLang = {
    c: 'c',
    cc: 'cpp',
    cpp: 'cpp',
    py: 'python',
    java: 'java',
    kt: 'kotlin',
};

export function getLang(filename: string) {
    const ext = filename.split('.').pop() || 'txt';
    return extLang[ext] || 'txt';
}

export function generateTypst(team: string, location: string, filename: string, lang: string) {
    return `
#let print(
    team: "",
    location: "",
    filename: "",
    lang: "",
    body
    ) = {
    set document(author: (team), title: filename)
    set text(font: "Linux Libertine", lang: "zh")
    set page(paper: "a4",
    header: [
        #team
        #if (location != "") {
        [[#location]]
        }
        filename: #filename
        #h(1fr)
        Page #counter(page).display("1 of 1",both: true) 
    ],
    )
        
    raw(read(filename), lang: lang)
    body
    }
    
    #show raw.line: it => {
    box(stack(
        dir: ltr,
        box(width: 18pt)[#it.number],
        it.body,
    ))
    }
    
    
    #show: print.with(team: "${team}", location: "${location}", filename: "${filename}", lang: "${lang}")
`;
}

export async function cachedFontInitOptions() {
    const {
        existsSync, mkdirSync, readFileSync, writeFileSync,
    } = fs;
    const dataDir = process.env.APPDATA
    || (process.platform === 'darwin'
        ? `${process.env.HOME}/Library/Preferences`
        : `${process.env.HOME}/.local/share`);

    const cacheDir = path.join(dataDir, 'typst/fonts');

    return {
        beforeBuild: [
            preloadFontAssets({
                assets: ['text', 'cjk', 'emoji'],
                // @ts-ignore
                fetcher: async (url: URL | RequestInfo, init?: RequestInit | undefined) => {
                    const cachePath = path.join(cacheDir, url.toString().replace(/[^a-zA-Z0-9]/g, '_'));
                    if (existsSync(cachePath)) {
                        const fontRes = {
                            arrayBuffer: async () => readFileSync(cachePath).buffer,
                        };

                        return fontRes as any;
                    }

                    console.log('loading remote font:', url);
                    const proxyOption = process.env.HTTPS_PROXY
                        ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
                        : {};

                    const fontRes = await fetch(url as any, {
                        ...proxyOption,
                        ...((init as any) || {}),
                    });
                    const buffer = await fontRes.arrayBuffer();
                    mkdirSync(path.dirname(cachePath), { recursive: true });
                    writeFileSync(cachePath, Buffer.from(buffer));
                    fontRes.arrayBuffer = async () => buffer;
                    return fontRes as any;
                },
            }),
        ],
    };
}
