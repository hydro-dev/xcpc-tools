/* eslint-disable import/no-dynamic-require */
import path from 'path';
import esbuild from 'esbuild';
import { fs, Logger } from '@hydrooj/utils';

const serverPkg = require(path.resolve(__dirname, 'packages/server/package.json'));
const clientPkg = require(path.resolve(__dirname, 'packages/client/package.json'));
const workspacePkg = require(path.resolve(__dirname, './package.json'));

const logger = new Logger('build');
logger.info('Building...');
(async () => {
    fs.ensureDirSync(path.resolve(__dirname, 'dist'));
    fs.ensureDirSync(path.resolve(__dirname, 'dist/assets'));
    fs.copySync(path.resolve(__dirname, 'assets'), path.resolve(__dirname, 'dist/assets'));
    const res = await esbuild.build({
        platform: 'node' as 'node',
        bundle: true,
        outdir: path.join(process.cwd(), 'dist'),
        splitting: false,
        write: false,
        minify: false,
        external: [
            'leveldown',
            ...Object.keys(serverPkg.dependencies),
            ...Object.keys(clientPkg.dependencies),
            ...Object.keys(workspacePkg.dependencies),
        ],
        entryPoints: [path.resolve(__dirname, 'entry.ts')],
    });
    if (res.errors.length) console.error(res.errors);
    if (res.warnings.length) console.warn(res.warnings);
    logger.info(`Resource Size: ${Math.floor((res.outputFiles[0].text.length / 1024 / 1024) * 10) / 10}MB`);
    fs.writeFileSync(path.resolve(__dirname, 'dist/entry.js'), res.outputFiles[0].text);
    logger.info('Saved to dist/entry.js');
})();
