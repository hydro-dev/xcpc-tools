import path from 'path';
import Schema from 'schemastery';
import { version } from './package.json';
import { fs, Logger, yaml } from './utils';

const logger = new Logger('init');

logger.info('Loading config');
const configPath = path.resolve(process.cwd(), 'config.server.yaml');
fs.ensureDirSync(path.resolve(process.cwd(), 'data'));
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `type: 
viewPass: ${String.random(8)}
server: 
token: 
username: 
password: 
secretRoute: ${String.random(12)}
seatFile: /home/icpc/Desktop/seat.txt`);
    logger.error('Config file generated, please fill in the config.yaml');
    process.exit(1);
}

const data = yaml.load(fs.readFileSync(configPath, 'utf8').toString());
const schema = Schema.object({
    viewPass: Schema.string().default(String.random(8)),
    server: Schema.string().role('url').required(),
    type: Schema.union(['server', 'client']).required(),
    token: Schema.string().required(),
    username: Schema.string().required(),
    password: Schema.string().required(),
    secretRoute: Schema.string().default(String.random(12)),
    seatFile: Schema.string().default('/home/icpc/Desktop/seat.txt'),
});
export const config = schema(data as any);
logger.info(`xcpc-tools server version: ${version}`);
logger.info(`Config loaded from ${configPath}`);
logger.info(`Server View User Info: admin/${config.viewPassword}`);
