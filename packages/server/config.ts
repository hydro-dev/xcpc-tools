import path from 'path';
import Schema from 'schemastery';
import { getPrinters } from 'unix-print';
import { version } from './package.json';
import { fs, Logger, yaml } from './utils';

const logger = new Logger('init');

logger.info('Loading config');
const isClient = process.argv.includes('--client');
const configPath = path.resolve(process.cwd(), `config.${isClient ? 'client' : 'server'}.yaml`);
fs.ensureDirSync(path.resolve(process.cwd(), 'data'));

// eslint-disable-next-line import/no-mutable-exports
export let exit: Promise<void> | null = null;

if (!fs.existsSync(configPath)) {
    // eslint-disable-next-line no-promise-executor-return
    exit = new Promise((resolve) => (async () => {
        const serverConfigDefault = `\
type: 
viewPass: ${String.random(8)}
server: 
token: 
username: 
password: 
secretRoute: ${String.random(12)}
seatFile: /home/icpc/Desktop/seat.txt
`;

        const clientConfigDefault = yaml.dump({
            server: '',
            balloon: '',
            printers: await getPrinters().then((r) => r.map((p) => p.printer)).catch(() => []),
            token: '',
        });
        fs.writeFileSync(configPath, isClient ? clientConfigDefault : serverConfigDefault);
        logger.error('Config file generated, please fill in the config.yaml');
        resolve();
    })());
    throw new Error();
}

const serverSchema = Schema.object({
    viewPass: Schema.string().default(String.random(8)),
    server: Schema.string().role('url').required(),
    type: Schema.union(['server', 'client']).required(),
    token: Schema.string().required(),
    username: Schema.string().required(),
    password: Schema.string().required(),
    secretRoute: Schema.string().default(String.random(12)),
    seatFile: Schema.string().default('/home/icpc/Desktop/seat.txt'),
});
const clientSchema = Schema.object({
    server: Schema.string().role('url').required(),
    balloon: Schema.string().required(),
    printers: Schema.array(Schema.string()).default([]).description('printer id list, will disable printing if unset'),
    token: Schema.string().required().description('Token generated on server'),
    fonts: Schema.array(Schema.string()).default([]),
});

export const config = (isClient ? clientSchema : serverSchema)(yaml.load(fs.readFileSync(configPath, 'utf8')) as any);
export const saveConfig = () => {
    fs.writeFileSync(configPath, yaml.dump(config));
};

logger.info(`Config loaded from ${configPath}`);
logger.info(`xcpc-tools version: ${version}`);
if (!isClient && !exit) logger.info(`Server View User Info: admin/${config.viewPassword}`);
