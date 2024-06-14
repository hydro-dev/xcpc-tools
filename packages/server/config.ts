import path from 'path';
import Schema from 'schemastery';
import { version } from './package.json';
import {
    checkReceiptPrinter,
    fs, getPrinters, Logger, yaml,
} from './utils';

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
type: server # server | domjudge | hydro
viewPass: ${String.random(8)} # use admin / viewPass to login
secretRoute: ${String.random(12)}
seatFile: /home/icpc/Desktop/seat.txt
# if type is server, the following is not needed
server: 
token: 
username: 
password: 
`;
        let printers = [];
        if (isClient) {
            printers = await getPrinters(true).catch(() => []);
            logger.info(printers.length, 'printers found:', printers.join(', '));
            await checkReceiptPrinter(printers);
        }
        const clientConfigDefault = yaml.dump({
            server: '',
            balloon: '',
            balloonLang: 'zh',
            printers: printers.map((p) => p.printer),
            token: '',
        });
        fs.writeFileSync(configPath, isClient ? clientConfigDefault : serverConfigDefault);
        logger.error('Config file generated, please fill in the config.yaml');
        resolve();
    })());
    throw new Error('no-config');
}

const serverSchema = Schema.intersect([
    Schema.object({
        type: Schema.union([
            Schema.const('server'),
            Schema.const('domjudge'),
            Schema.const('hydro'),
        ] as const).description('server type').required(),
        port: Schema.number().default(5283),
        viewPass: Schema.string().default(String.random(8)),
        secretRoute: Schema.string().default(String.random(12)),
        seatFile: Schema.string().default('/home/icpc/Desktop/seat.txt'),
    }).description('Basic Config'),
    Schema.union([
        Schema.object({
            type: Schema.union([
                Schema.const('domjudge'),
                Schema.const('hydro'),
            ] as const).required(),
            server: Schema.transform(String, (i) => (i.endsWith('/') ? i : `${i}/`)).role('url').required(),
            contestId: Schema.string(),
            token: Schema.string(),
            username: Schema.string(),
            password: Schema.string(),
            freezeEncourage: Schema.number().default(0),
        }).description('Fetcher Config'),
        Schema.object({
            type: Schema.const('server').required(),
        }).description('Server Mode Config'),
    ]),
]);
const clientSchema = Schema.object({
    server: Schema.string().role('url').required(),
    balloon: Schema.string(),
    balloonLang: Schema.union(['zh', 'en']).default('zh').required(),
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
if (!isClient && !exit) logger.info(`Server View User Info: admin / ${config.viewPass}`);
