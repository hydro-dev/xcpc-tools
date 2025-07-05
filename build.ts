import child from 'child_process';
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
        target: 'node16',
        tsconfig: path.resolve(process.cwd(), 'tsconfig.json'),
        minify: !process.argv.includes('--debug'),
        entryPoints: [path.resolve(process.cwd(), 'packages/server/index.ts')],
        charset: 'utf8',
        sourcemap: process.argv.includes('--debug') ? 'inline' : false,
        metafile: true,
        external: ['mongodb', 'bson', 'moment-timezone', 'moment'],
        plugins: [{
            name: 'base16384',
            setup(b) {
                b.onLoad({ filter: /\.(frontend|ttf|wasm)$/, namespace: 'file' }, (t) => {
                    const file = fs.readFileSync(path.join(t.path));
                    const contents = `module.exports = "${process.argv.includes('--no-binary') ? '' : encodeBinary(file)}";\n${nopMap}`;
                    console.log(t.path, size(contents));
                    return {
                        contents,
                        loader: 'tsx',
                    };
                });
                b.onLoad({ filter: /node_modules.*\.[jt]sx?$/ }, async (t) => ({
                    contents: `${await fs.readFile(t.path, 'utf-8')}\n${nopMap}`,
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
    fs.writeFileSync(path.resolve(process.cwd(), 'dist/metafile.json'), JSON.stringify(res.metafile));
    logger.info('Saved to dist/xcpc-tools.js');
    if (!process.env.SEA) return;
    fs.writeFileSync(path.resolve(process.cwd(), 'dist/sea-config.json'), JSON.stringify({
        main: 'xcpc-tools.js',
        output: 'sea-prep.blob',
    }));
    child.execSync('node --experimental-sea-config sea-config.json', { cwd: path.resolve(process.cwd(), 'dist') });
    fs.copyFileSync(path.resolve(process.cwd(), 'nanode-v22.x-icu_none-v8_opts-lto-x64'), path.resolve(process.cwd(), 'dist/nanode'));
    child.execSync(
        'npx postject nanode NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
        { cwd: path.resolve(process.cwd(), 'dist') },
    );
})();
