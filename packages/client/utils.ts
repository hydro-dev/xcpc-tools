import path from 'path';
import { preloadRemoteFonts } from '@myriaddreamin/typst.ts/dist/cjs/options.init.cjs';
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
    set text(font: (${Object.keys(global.Tools.config.fonts).map((i) => `"${i}"`).join(', ')}), lang: "zh")
    set page(paper: "a4",
    header: [
        #if (location != "") {
        [[#location]]
        }
        #team
        #h(1fr)
        By Hydro/XCPC-TOOLS
        \n
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
    return {
        beforeBuild: [
            preloadRemoteFonts(
                Object.values(global.Tools.config.fonts), {
                    assetUrlPrefix: '/',
                    // @ts-ignore
                    fetcher: async (name: string) => {
                        if (name.startsWith('https://raw.githubusercontent.com')) return { arrayBuffer: async () => null };
                        const fontPath = path.resolve(__dirname, 'fonts', name);
                        if (!fs.existsSync(fontPath)) throw Error(`Can not find font ${name}`);
                        console.log('use local font', fontPath);
                        return {
                            arrayBuffer: async () => fs.readFileSync(fontPath).buffer,
                        };
                    },
                }),
        ],
    };
}
