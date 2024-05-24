import path from 'path';
import { fs, Logger, yaml } from './utils';
const logger = new Logger('init');

export function load() {
    try {
        logger.info('Loading config');
        const configPath = path.resolve(process.cwd(), 'config.server.yaml');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, `type: 
viewPass: ${String.random(8)}
server: 
token: 
username: 
password: 
secretRoute: ${String.random(12)}
seatFile: /home/icpc/Desktop/seat.txt`);
            throw new Error('Config file generated, please fill in the config.yaml');
        }
        const data = yaml.load(fs.readFileSync(configPath, 'utf8').toString()) as Record<string, string>;
        global.Tools = {
            config: {
                ...data,
                token: data.token
                    ? `Barer ${data.token}`
                    : (data.username && data.password ? `Basic ${Buffer.from(`${data.username}:${data.password}`).toString('base64')}` : ''),
                viewPassword: data.viewPass,
            },
            version: require('./package.json').version,
        };
        logger.info(`XCPC-TOOLS Server Version: ${global.Tools.version}`);
        const config = global.Tools.config;
        logger.info(`Config loaded from ${configPath}`);
        if (!config.type) throw new Error('Type is required');
        if (!config.viewPassword) throw new Error('View password is required');
        if (config.type !== 'server') {
            if (!config.server) throw new Error('Server is required');
            if (!config.token) throw new Error('Authentication is required');
        }
        fs.ensureDirSync(path.resolve(process.cwd(), 'data'));
        logger.info(`Server View User Info: admin/${config.viewPassword}`);
    } catch (e) {
        logger.error(e);
        process.exit(1);
    }
}
