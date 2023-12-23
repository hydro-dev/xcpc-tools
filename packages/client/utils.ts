import path from 'path';
import { preloadRemoteFonts } from '@myriaddreamin/typst.ts/dist/cjs/options.init.cjs';
import { readFileSync } from 'fs-extra';
import Logger from 'reggol';

Logger.levels.base = process.env.DEV ? 3 : 2;
Logger.targets[0].showTime = 'dd hh:mm:ss';
Logger.targets[0].label = {
    align: 'right',
    width: 9,
    margin: 1,
};

const logger = new Logger('utils');

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
    set text(font: ("Linux Libertine"), lang: "zh")
    set page(
        paper: "a4",
        header: [
            #if (location != "") {
                [[#location]]
            }
            #team
            #h(1fr)
            By Hydro/XCPC-TOOLS

            filename: #filename
            #h(1fr)
            Page #counter(page).display("1 of 1", both: true)
        ]
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

#show: print.with(
    team: ${JSON.stringify(team || '')},
    location: ${JSON.stringify(location || '')},
    filename: ${JSON.stringify(filename || '')},
    lang: ${JSON.stringify(lang || '')}
)`;
}

const fontFiles = [
    'DejaVuSansMono.ttf',
    'DejaVuSansMono-Bold.ttf',
    'DejaVuSansMono-Oblique.ttf',
    'DejaVuSansMono-BoldOblique.ttf',
    'NotoSansSC_400Regular.ttf',
];

export async function cachedFontInitOptions() {
    return {
        beforeBuild: [
            preloadRemoteFonts(
                Object.keys(fontFiles), {
                    assets: false,
                    assetUrlPrefix: '/',
                    fetcher: async (url) => {
                        const name = url.toString().split('/').pop() as string;
                        const filepath = path.resolve(process.cwd(), 'assets', name);
                        logger.info('loading font:', name, 'from', filepath);
                        const fontRes = readFileSync(filepath);
                        return { arrayBuffer: async () => fontRes.buffer } as any;
                    },
                }),
        ],
    };
}

export * as fs from 'fs-extra';
export * as yaml from 'js-yaml';
export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(true), timeout);
    });
}
export { Logger };
