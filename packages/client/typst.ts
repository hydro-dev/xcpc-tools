// Fork from typst.ts/packages/typst.ts/src/compiler.mts

import { resolve as pathResolve } from 'path';
import type * as typst from '@myriaddreamin/typst-ts-web-compiler/pkg/wasm-pack-shim.mjs';
import { fs } from './utils';

export type CompileFormat = 'vector' | 'pdf';

export interface CompileOptions<F extends CompileFormat = any> {
    mainFilePath: string;
    format?: F;
}

const fontFiles = [
    'DejaVuSansMono.ttf',
    'DejaVuSansMono-Bold.ttf',
    'DejaVuSansMono-Oblique.ttf',
    'DejaVuSansMono-BoldOblique.ttf',
    'NotoSansSC_400Regular.ttf',
];

class TypstCompilerDriver {
    compiler: typst.TypstCompiler;
    compilerJs: typeof typst;
    loadedFonts = new Set<string>();

    async init(): Promise<void> {
        // convert to buffer
        const wasmModule = fs.readFileSync(pathResolve(process.cwd(), 'assets', 'typst_ts_web_compiler_bg.wasm')).buffer;
        this.compilerJs = await import('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs');
        await this.compilerJs.initSync(wasmModule);
        const TypstCompilerBuilder = this.compilerJs.TypstCompilerBuilder;

        this.compiler = new TypstCompilerBuilder();
        // TODO: load fonts
        for (const fontFile of fontFiles) {
            if (!this.loadedFonts.has(fontFile)) {
                this.loadedFonts.add(fontFile);
                const fontRes = fs.readFileSync(pathResolve(process.cwd(), 'assets', fontFile));
                // eslint-disable-next-line no-await-in-loop
                await this.compiler.add_raw_font(new Uint8Array(fontRes.buffer));
            }
        }
    }

    compile(options): Promise<Uint8Array> {
        return new Promise<Uint8Array>((resolve) => {
            resolve(this.compiler.compile(options.mainFilePath, options.format || 'vector'));
        });
    }

    async reset(): Promise<void> {
        await new Promise<void>((resolve) => {
            this.compiler.reset();
            resolve(undefined);
        });
    }

    addSource(path: string, source: string): void {
        this.compiler.add_source(path, source);
    }
}

export async function createTypstCompiler() {
    const compiler = new TypstCompilerDriver();
    await compiler.init();
    return compiler;
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
