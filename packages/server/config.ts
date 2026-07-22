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
clients:
  - token: ${randomstring()}
    name: Printer
    type: [printer]
  - token: ${randomstring()}
    name: Balloon
    type: [balloon]
arenaLayouts: data/arena-layouts.json # path to arena layout JSON
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

const serviceClientSchema = Schema.object({
    token: Schema.string().required().description('16-128 character URL-safe secret used by config.client.yaml'),
    name: Schema.string().required(),
    type: Schema.array(Schema.union(['printer', 'balloon'] as const)).min(1).default(['printer']),
});

const webhookClientSchema = Schema.object({
    id: Schema.string().required().description('Unique notifier identifier'),
    name: Schema.string().required(),
    type: Schema.const('webhook').required(),
    subType: Schema.union(['telegram', 'discord', 'wxwork', 'dingtalk', 'lark'] as const).required(),
    token: Schema.string().required(),
    chatId: Schema.string().default(''),
    endpoint: Schema.string().default(''),
    balloonTemplate: Schema.string().default(''),
    report: Schema.boolean().default(false),
    enabled: Schema.boolean().default(true),
});

const serverSchema = Schema.intersect([
    Schema.object({
        type: Schema.union([
            Schema.const('server'),
            Schema.const('domjudge'),
            Schema.const('hydro'),
        ] as const).description('server type').required(),
        port: Schema.number().default(5283),
        viewPass: Schema.string().default(randomstring(8)),
        secretRoute: Schema.string().default(randomstring(12)),
        customKeyfile: Schema.string().default(''),
        arenaLayouts: Schema.string().pattern(/\.json$/i).default('data/arena-layouts.json')
            .description('Path to arena layouts JSON file (.json)'),
        clients: Schema.array(Schema.union([
            serviceClientSchema,
            webhookClientSchema,
        ])).default([]).description('Print, balloon and bot clients managed by config.server.yaml'),
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
if (!isClient) {
    const reportingWebhooks = (config.clients || [])
        .filter((client: any) => client.type === 'webhook' && client.report);
    if (reportingWebhooks.length > 1) {
        const ids = reportingWebhooks.map((client: any) => client.id).join(', ');
        throw new Error(`Only one webhook client may set report: true: ${ids}`);
    }
}
export const saveConfig = () => {
    fs.writeFileSync(configPath, yaml.dump(config));
};
export const version = packageVersion;

const loadArenaLayouts = (): unknown[] => {
    if (isClient || !config.arenaLayouts) return [];
    const layoutsPath = path.resolve(process.cwd(), config.arenaLayouts);
    if (!fs.existsSync(layoutsPath)) {
        logger.warn(`Arena layouts file not found: ${layoutsPath}`);
        return [];
    }
    try {
        const content = fs.readFileSync(layoutsPath, 'utf8');
        const extension = path.extname(layoutsPath).toLowerCase();
        if (extension !== '.json') throw new Error('Arena layouts file must use the .json extension');
        const parsed = JSON.parse(content);
        const fallbackId = path.basename(layoutsPath, extension);
        const layouts = (Array.isArray(parsed) ? parsed : [parsed]).map((layout, index) => ({
            ...layout,
            id: layout?.id || (index === 0 ? fallbackId : `${fallbackId}-${index + 1}`),
        }));
        logger.info(`Loaded ${layouts.length} arena layout(s) from ${layoutsPath}`);
        return layouts;
    } catch (error) {
        logger.error(`Failed to load arena layouts from ${layoutsPath}`, error);
        return [];
    }
};

export const arenaLayouts = loadArenaLayouts();

logger.info(`Config loaded from ${configPath}`);
logger.info(`xcpc-tools version: ${packageVersion}`);
if (!isClient && !exit) logger.info(`Server View User Info: admin / ${config.viewPass}`);
