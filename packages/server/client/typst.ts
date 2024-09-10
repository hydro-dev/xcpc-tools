// Class TypstCompilerDriver is fork from https://github.com/Myriad-Dreamin/typst.ts/blob/main/packages/typst.ts/src/compiler.mts
// It use Apache License 2.0
// See its lisense on https://github.com/Myriad-Dreamin/typst.ts/blob/main/LICENSE

import type * as typst from '@myriaddreamin/typst-ts-web-compiler/pkg/wasm-pack-shim.mjs';
import {
    DejaVuSansMono,
    DejaVuSansMonoBold,
    DejaVuSansMonoBoldOblique,
    DejaVuSansMonoOblique,
    NotoColorEmoji,
    NotoSansSC,
    wasmBinary,
} from './assets';

export type CompileFormat = 'vector' | 'pdf';

export interface CompileOptions<F extends CompileFormat = any> {
    mainFilePath: string;
    format?: F;
}

class TypstCompilerDriver {
    compiler: typst.TypstCompiler;
    builder: typst.TypstCompilerBuilder;
    compilerJs: typeof typst;
    loadedFonts = new Set<string>();

    async init(): Promise<void> {
        this.compilerJs = await import('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs');
        await this.compilerJs.initSync(wasmBinary);
        const TypstCompilerBuilder = this.compilerJs.TypstCompilerBuilder;

        this.builder = new TypstCompilerBuilder();
        await this.builder.add_raw_font(new Uint8Array(DejaVuSansMono));
        await this.builder.add_raw_font(new Uint8Array(DejaVuSansMonoBold));
        await this.builder.add_raw_font(new Uint8Array(DejaVuSansMonoBoldOblique));
        await this.builder.add_raw_font(new Uint8Array(DejaVuSansMonoOblique));
        await this.builder.add_raw_font(new Uint8Array(NotoSansSC));
        await this.builder.add_raw_font(new Uint8Array(NotoColorEmoji));
        this.compiler = await this.builder.build();
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

export function generateTypst(team: string, location: string, filename: string, lang: string, codeColor: boolean) {
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

    raw(read(filename), lang: lang, block: true${codeColor ? '' : ', theme: "BW.tmtheme"'})
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
