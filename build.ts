import path from 'path';
import { fs, Logger } from '@hydrooj/utils';
import cac from 'cac';
import esbuild from 'esbuild';

const buildPackages = cac().parse().args[0];
if (!buildPackages) throw new Error('No package specified');

const logger = new Logger('build');
logger.info(`Building ${buildPackages}...`);
(async () => {
    const res = await esbuild.build({
        platform: 'node' as 'node',
        bundle: true,
        outdir: '/tmp',
        splitting: false,
        write: false,
        minify: true,
        entryPoints: [path.resolve(__dirname, `packages/${buildPackages}/index.ts`)],
    });
    if (res.errors.length) console.error(res.errors);
    if (res.warnings.length) console.warn(res.warnings);
    logger.info(`Resource Size: ${Math.floor((res.outputFiles[0].text.length / 1024 / 1024) * 10) / 10}MB`);
    fs.writeFileSync(path.resolve(__dirname, `dist/${buildPackages}.js`), res.outputFiles[0].text);
    logger.info(`${buildPackages} saved to dist/${buildPackages}.js`);
})();
