import path from 'path';
import { fs, Logger, yaml } from '@hydrooj/utils';
const logger = new Logger('init');

export function load() {
    try {
        logger.info('Loading config');
        const configPath = path.resolve(__dirname, 'config.yaml');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, 'server: \ntype: \ntoken: \nusername: \npassword: \n');
            throw new Error('Config file generated, please fill in the config.yaml');
        }
        const {
            server, type, token, username, password, port, cors,
        } = yaml.load(fs.readFileSync(configPath, 'utf8').toString()) as any;
        global.Tools = {
            config: {
                server,
                type,
                token: token ? `Barer ${token}` : (username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : ''),
                port,
                cors,
            },
            version: require('./package.json').version,
        };
        logger.info(`XCPC-TOOLS Server Version: ${global.Tools.version}`);
        const config = global.Tools.config;
        logger.info(`Config loaded from ${configPath}`);
        if (!config.server) throw new Error('Server is required');
        if (!config.type) throw new Error('Type is required');
        if (!config.token) throw new Error('Authentication is required');
        fs.ensureDirSync(path.resolve(__dirname, 'data'));
        if (fs.existsSync(path.resolve(__dirname, 'data/client.json'))) {
            const clients = fs.readFileSync(path.resolve(__dirname, 'client.json'), 'utf8');
            global.Tools.clients = JSON.parse(clients);
        } else {
            fs.writeFileSync(path.resolve(__dirname, 'data/client.json'), '[]');
            global.Tools.clients = [];
        }
    } catch (e) {
        logger.error(e);
        process.exit(1);
    }
}
