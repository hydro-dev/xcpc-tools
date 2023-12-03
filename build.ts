import path from 'path';
import esbuild from 'esbuild';
import { fs, Logger } from '@hydrooj/utils';

const logger = new Logger('build');
logger.info('Building...');
(async () => {
    const res = await esbuild.build({
        platform: 'node' as 'node',
        bundle: true,
        outdir: path.join(process.cwd(), 'dist'),
        splitting: false,
        write: false,
        minify: false,
        external: ['leveldown'],
        entryPoints: [path.resolve(__dirname, 'entry.ts')],
    });
    if (res.errors.length) console.error(res.errors);
    if (res.warnings.length) console.warn(res.warnings);
    logger.info(`Resource Size: ${Math.floor((res.outputFiles[0].text.length / 1024 / 1024) * 10) / 10}MB`);
    fs.ensureDirSync(path.resolve(__dirname, 'dist'));
    fs.writeFileSync(path.resolve(__dirname, 'dist/entry.js'), res.outputFiles[0].text);
    logger.info('Saved to dist/entry.js');
})();
