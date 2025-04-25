/* eslint-disable import/no-dynamic-require */
import path from 'path';
import zlib from 'zlib';
import { encode } from 'base16384';
import esbuild from 'esbuild';
import { chunk } from 'lodash';
import { fs, Logger } from '@hydrooj/utils';

const logger = new Logger('build');
logger.info('Building...');

function encodeBinary(a: Buffer) {
    const file = zlib.gzipSync(a, { level: 9 });
    return chunk([...encode(file)], 1000).map((i) => String.fromCodePoint(...i)).join('');
}
function size(a: string) {
    return `${Math.floor((Buffer.from(a).length / 1024 / 1024) * 10) / 10}MB`;
}

const nopMap = '//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==';

(async () => {
    fs.ensureDirSync(path.resolve(process.cwd(), 'dist'));
    const res = await esbuild.build({
        platform: 'node',
        bundle: true,
        outdir: path.join(process.cwd(), 'dist'),
        splitting: false,
        write: false,
        tsconfig: path.resolve(process.cwd(), 'tsconfig.json'),
        minify: true,
        entryPoints: [path.resolve(process.cwd(), 'packages/server/index.ts')],
        charset: 'utf8',
        sourcemap: process.argv.includes('--debug') ? 'inline' : false,
        plugins: [{
            name: 'base16384',
            setup(b) {
                b.onLoad({ filter: /\.(frontend|ttf|wasm)$/, namespace: 'file' }, (t) => {
                    const file = fs.readFileSync(path.join(t.path));
                    const contents = `module.exports = "${encodeBinary(file)}";\n${nopMap}`;
                    console.log(t.path, size(contents));
                    return {
                        contents,
                        loader: 'tsx',
                    };
                });
                b.onLoad({ filter: /node_modules\/.+\.js$/ }, (t) => ({
                    contents: `${fs.readFileSync(t.path, 'utf8')}\n${nopMap}`,
                    loader: 'default',
                }));
            },
        }],
        alias: {
            ws: `${path.dirname(require.resolve('ws/package.json'))}/index.js`,
            saslprep: path.resolve(__dirname, 'saslprep.js'),
        },
    });
    if (res.errors.length) console.error(res.errors);
    if (res.warnings.length) console.warn(res.warnings);
    logger.info(`Resource Size: ${size(res.outputFiles[0].text)}`);
    fs.writeFileSync(path.resolve(process.cwd(), 'dist/xcpc-tools.js'), res.outputFiles[0].text);
    logger.info('Saved to dist/xcpc-tools.js');
})();
