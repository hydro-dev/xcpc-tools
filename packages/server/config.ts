import path from 'node:path';
import Schema from 'schemastery';
import { Config } from './handler/monitor';
import { version as packageVersion } from './package.json';
import {
    checkReceiptPrinter,
    fs, getPrinters, Logger, randomstring, yaml,
} from './utils';

const logger = new Logger('init');

logger.info('Loading config');
const isClient = process.argv.includes('--client');
const configPath = path.resolve(process.cwd(), `config.${isClient ? 'client' : 'server'}.yaml`);
fs.ensureDirSync(path.resolve(process.cwd(), 'data'));

const balloonTemplateDefault = `\
#align center

#bold true
#size 2
%RECEIPT

{id}

#bold false
#size 1
===============================

#oneLine %LOCATION {location}
#oneLine %PROBLEM {problem}
#oneLine %COLOR {color}
#oneLine %COMMENT {comment}
#align center
#bold true
#size 0
%TEAM: {team}
%STATUS: {status}
Time: {time}`;

// eslint-disable-next-line import/no-mutable-exports
export let exit: Promise<void> | null = null;

if (!fs.existsSync(configPath)) {
    // eslint-disable-next-line no-promise-executor-return
    exit = new Promise((resolve) => (async () => {
        const serverConfigDefault = `\
type: server # server | domjudge | hydro
viewPass: ${randomstring(8)} # use admin / viewPass to login
secretRoute: ${randomstring(12)}
customKeyfile: 
# if type is server, the following is not needed
server: 
token: 
username: 
password: 
monitor:
  timeSync: false
`;
        let printers = [];
        if (isClient) {
            printers = (await getPrinters().catch(() => [])).map((p: any) => p.printer);
            logger.info(printers.length, 'printers found:', JSON.stringify(printers));
            await checkReceiptPrinter(await getPrinters(true));
        }
        const clientConfigDefault = yaml.dump({
            server: '',
            token: '',
            balloon: '',
            balloonLang: 'zh',
            balloonType: 80,
            printColor: false,
            printers,
            balloonTemplate: balloonTemplateDefault,
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
        xhost: Schema.string().default('x-forwarded-host'),
        viewPass: Schema.string().default(randomstring(8)),
        secretRoute: Schema.string().default(randomstring(12)),
        customKeyfile: Schema.string().default(''),
        monitor: Config,
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
    server: Schema.transform(String, (i) => (i.endsWith('/') ? i : `${i}/`)).role('url').required(),
    balloon: Schema.string(),
    balloonLang: Schema.union(['zh', 'en']).default('zh').required(),
    balloonType: Schema.union([58, 80, 'plain']).default(80),
    balloonCommand: Schema.string().default(''),
    balloonTemplate: Schema.string().default(balloonTemplateDefault),
    printColor: Schema.boolean().default(false),
    printPageMax: Schema.number().default(5),
    printMergeQueue: Schema.number().default(1),
    printers: Schema.array(Schema.string()).default([]).description('printer id list, will disable printing if unset'),
    token: Schema.string().required().description('Token generated on server'),
    fonts: Schema.array(Schema.string()).default([]),
});

export const config = (isClient ? clientSchema : serverSchema)(yaml.load(fs.readFileSync(configPath, 'utf8')) as any);
export const saveConfig = () => {
    fs.writeFileSync(configPath, yaml.dump(config));
};
export const version = packageVersion;

logger.info(`Config loaded from ${configPath}`);
logger.info(`xcpc-tools version: ${packageVersion}`);
if (!isClient && !exit) logger.info(`Server View User Info: admin / ${config.viewPass}`);
