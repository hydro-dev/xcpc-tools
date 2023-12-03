import path from 'path';
import { preloadFontAssets, preloadRemoteFonts } from '@myriaddreamin/typst.ts/dist/cjs/options.init.cjs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { fs } from '@hydrooj/utils';

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
    set text(font: (${Object.keys(global.Tools.config.fonts).map((i) => JSON.stringify(i)).join(', ')}), lang: "zh")
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

export async function cachedFontInitOptions() {
    return {
        beforeBuild: [
            preloadFontAssets({
                assets: ['text', 'cjk', 'emoji'],
                // @ts-ignore
                fetcher: async (url: URL | RequestInfo, init?: RequestInit | undefined) => {
                    const name = url.toString().split('/').pop() as string;
                    const fontPath = path.resolve(process.cwd(), 'fonts', name);
                    if (fs.existsSync(fontPath)) {
                        console.log('use local font', fontPath);
                        return {
                            arrayBuffer: async () => fs.readFileSync(fontPath).buffer,
                        };
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
                    fs.writeFileSync(fontPath, Buffer.from(buffer));
                    fontRes.arrayBuffer = async () => buffer;
                    return fontRes as any;
                },
            }),
            preloadRemoteFonts(
                Object.values(global.Tools.config.fonts), {
                    assetUrlPrefix: '/',
                },
            ),
        ],
    };
}
