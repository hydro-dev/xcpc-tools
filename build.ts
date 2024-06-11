/* eslint-disable import/no-dynamic-require */
import path from 'path';
import esbuild from 'esbuild';
import { fs, Logger } from '@hydrooj/utils';

const logger = new Logger('build');
logger.info('Building...');
(async () => {
    fs.ensureDirSync(path.resolve(process.cwd(), 'dist'));
    const res = await esbuild.build({
        platform: 'node',
        bundle: true,
        outdir: path.join(process.cwd(), 'dist'),
        splitting: false,
        write: false,
        tsconfig: path.resolve(process.cwd(), 'tsconfig.json'),
        minify: false,
        entryPoints: [path.resolve(process.cwd(), 'packages/server/index.ts')],
        charset: 'utf8',
        sourcemap: 'inline',
        loader: {
            '.frontend': 'base64',
            '.ttf': 'base64',
            '.wasm': 'base64',
        },
        alias: {
            ws: `${path.dirname(require.resolve('ws/package.json'))}/index.js`,
            saslprep: path.resolve(__dirname, 'saslprep.js'),
        },
    });
    if (res.errors.length) console.error(res.errors);
    if (res.warnings.length) console.warn(res.warnings);
    logger.info(`Resource Size: ${Math.floor((res.outputFiles[0].text.length / 1024 / 1024) * 10) / 10}MB`);
    fs.writeFileSync(path.resolve(process.cwd(), 'dist/xcpc-tools.js'), res.outputFiles[0].text);
    logger.info('Saved to dist/xcpc-tools.js');
})();
