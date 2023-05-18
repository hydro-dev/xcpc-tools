import { Logger, fs, yaml } from '@hydrooj/utils';
import path from 'path';
import http from './http';
import runner from './runner';
const logger = new Logger('client/loader');

async function run(mode: string) {
    if (!['balloon','printer'].includes(mode)) {
        logger.error('Invalid mode');
        process.exit(1);
    }
    const configPath = path.resolve('.', 'config.yaml');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, 'server:\nuname:\npassword:\n');
        logger.error('Please edit config file at', configPath);
        process.exit(1);
    }
    const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
    if (!config.server || !config.uname || !config.password) {
        logger.error('Please edit config file at', configPath);
        process.exit(1);
    }
    logger.info('Config loaded.');
    const client = new http(config);
    let info;
    try {
        info = await client.get(`/info/${mode}`).timeout(1000);
        if (info.body.error) logger.error(info.body.error);
        if (!info.body || !info.body.contest) process.exit(1);
        logger.info('Connected to', info.body.contest);
    } catch (e) {
        logger.error(e);
        logger.error('Cannot connect to server.');
        process.exit(1);
    }
    setInterval(runner[mode](info.body), 1000);
}

process.on('unhandledRejection', (e) => {
    logger.error(e);
    setTimeout(() => {
        logger.error(e);
        process.exit(1);
    }, 1000);
});
process.on('uncaughtException', (e) => {
    logger.error(e);
    setTimeout(() => {
        logger.error(e);
        process.exit(1);
    }, 1000);
});

if (!process.argv[2]) logger.error('client <mode>');
else run(process.argv[2]).catch(e => {
    logger.error(e);
    setTimeout(() => {
        logger.error(e);
        process.exit(1);
    }, 1000);
});