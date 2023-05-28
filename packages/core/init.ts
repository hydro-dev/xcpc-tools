import os from 'os';
import path from 'path';
import { fs, Logger, yaml } from '@hydrooj/utils';
const logger = new Logger('init');

export function load() {
    try {
        logger.info('Loading config');
        const hydroPath = path.resolve(os.homedir(), '.hydro');
        fs.ensureDirSync(hydroPath);
        const configPath = path.resolve(hydroPath, 'xcpc-tools.yaml');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, 'type:\nendpoint:\ncontestId:\nuname:\npassword:\n');
            throw new Error(`Please edit config file at ${configPath}`);
        }
        global.Tools = {
            config: yaml.load(fs.readFileSync(configPath, 'utf8')),
            version: require('./package.json').version,
        };
        if (!global.Tools.config.sessionKeys) {
            global.Tools.config.sessionKeys = [require('crypto').randomBytes(32).toString('hex')];
            fs.writeFileSync(configPath, yaml.dump(global.Tools.config));
        }
        logger.info(`XCPC-TOOLS Version: ${global.Tools.version}`);
        const config = global.Tools.config;
        logger.info(`Config loaded from ${configPath}`);
        if (!config.type || !config.endpoint || !config.contestId || !config.uname || !config.password) throw new Error('Invalid config');
    } catch (e) {
        logger.error(e);
        process.exit(1);
    }
}
