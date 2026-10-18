import path from 'node:path';
import { Context, Service } from 'cordis';
import Schema from 'schemastery';
import { version as packageVersion } from '../package.json';
import {
    checkReceiptPrinter,
    fs, getPrinters, randomstring, yaml,
} from '../utils';

// ---------------------------------------------------------------------------
// ConfigService (rev.4 block 3): the business configuration used to be an
// eagerly-executed module (import side effects: template writing, schema
// validation, arena-layout loading). It is now a cordis service so loading
// happens at a defined point of the boot sequence — after the logger is up,
// before any consumer plugin — and consumers read it from their context
// (ctx.config.config.<field>) instead of a module singleton.
//
// cordis.yml (loader mode) only decides which plugins load; the business
// configuration still lives in config.server.yaml / config.client.yaml in the
// working directory, exactly as before.
// ---------------------------------------------------------------------------

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

const serviceClientSchema = Schema.object({
    token: Schema.string().required().description('16-128 character URL-safe secret used by config.client.yaml'),
    name: Schema.string().required(),
    type: Schema.array(Schema.union(['printer', 'balloon'] as const)).min(1).default(['printer']),
});

const sshSchema = Schema.object({
    enabled: Schema.boolean().default(false),
    username: Schema.string().default('root'),
}).default({
    enabled: false,
    username: 'root',
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

const monitorSchema = Schema.object({
    timeSync: Schema.boolean().default(false),
    reportToken: Schema.string().default('').description('Optional query token shared by HTTP and WebSocket machine reports'),
    exporters: Schema.array(Schema.object({
        job: Schema.string().required(),
        port: Schema.number().required(),
    })).default([{ job: 'node', port: 9100 }]),
    auto: Schema.object({
        name: Schema.string().default(''),
        group: Schema.union([
            Schema.string(),
            Schema.boolean(),
            Schema.number().min(1).max(64).step(1),
        ]).default(''),
        camera: Schema.string().default(''),
        desktop: Schema.string().default(''),
    }).default({ name: '', group: '', camera: '', desktop: '' }),
}).default({
    timeSync: false,
    reportToken: '',
    exporters: [{ job: 'node', port: 9100 }],
    auto: { name: '', group: '', camera: '', desktop: '' },
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
        ssh: sshSchema,
        clients: Schema.array(Schema.union([
            serviceClientSchema,
            webhookClientSchema,
        ])).default([]).description('Print, balloon and bot clients managed by config.server.yaml'),
        monitor: monitorSchema,
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
    printers: Schema.array(Schema.union([
        Schema.string(),
        Schema.object({
            printer: Schema.string().required(),
            group: Schema.string(),
        }),
    ])).default([]).description('enabled printers; an optional group limits a printer to matching tasks'),
    token: Schema.string().required().description('Token generated on server'),
    fonts: Schema.array(Schema.string()).default([]),
    localWeb: Schema.object({
        enabled: Schema.boolean().default(true),
        host: Schema.string().default('127.0.0.1'),
        port: Schema.number().default(5284),
    }).default({ enabled: true, host: '127.0.0.1', port: 5284 }),
});

export class ConfigService extends Service {
    readonly isClient = process.argv.includes('--client');
    readonly configPath = path.resolve(process.cwd(), `config.${this.isClient ? 'client' : 'server'}.yaml`);
    /** false when no config existed: a template was written, nothing loaded */
    loaded = false;
    firstRun = false;
    /** parsed configuration object (same shape the old config.ts module exported) */
    config: any = {};
    arenaLayouts: unknown[] = [];
    readonly version = packageVersion;

    constructor(ctx: Context) {
        super(ctx, 'config');
        this.ctx.logger('init').info('Loading config');
        fs.ensureDirSync(path.resolve(process.cwd(), 'data'));
        if (!fs.existsSync(this.configPath)) {
            this.firstRun = true;
            return;
        }
        this.config = (this.isClient ? clientSchema : serverSchema)(
            yaml.load(fs.readFileSync(this.configPath, 'utf8')) as any,
        );
        if (!this.isClient) {
            if (this.config.ssh.enabled && !this.config.customKeyfile) {
                throw new Error('customKeyfile is required when WebSSH is enabled');
            }
            const reportingWebhooks = (this.config.clients || [])
                .filter((client: any) => client.type === 'webhook' && client.report);
            if (reportingWebhooks.length > 1) {
                const ids = reportingWebhooks.map((client: any) => client.id).join(', ');
                throw new Error(`Only one webhook client may set report: true: ${ids}`);
            }
        }
        this.arenaLayouts = this.loadArenaLayouts();
        this.loaded = true;
        const logger = this.ctx.logger('init');
        logger.info(`Config loaded from ${this.configPath}`);
        logger.info(`xcpc-tools version: ${packageVersion}`);
        if (!this.isClient) logger.info(`Server View User Info: admin / ${this.config.viewPass}`);
    }

    /** Write a fresh template (first run only). Non-fatal by design: the
     *  process exits cleanly afterwards and the user fills the file in. */
    async writeTemplate() {
        await new Promise<void>((resolve) => (async () => {
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
ssh:
  enabled: false
  username: root
# if type is server, the following is not needed
server:
token:
username:
password:
monitor:
  timeSync: false
  reportToken: '' # optional token for both /report and /probe
  exporters:
    - job: node
      port: 9100
  auto:
    name: ''
    group: ''
    camera: ''
    desktop: ''
`;
            let printers: unknown[] = [];
            if (this.isClient) {
                printers = (await getPrinters().catch(() => [])).map((p: any) => p.printer);
                this.ctx.logger('init').info(printers.length, 'printers found:', JSON.stringify(printers));
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
                localWeb: {
                    enabled: true,
                    host: '127.0.0.1',
                    port: 5284,
                },
                balloonTemplate: balloonTemplateDefault,
            });
            fs.writeFileSync(this.configPath, this.isClient ? clientConfigDefault : serverConfigDefault);
            resolve();
        })());
        this.ctx.logger('init').error('Config file generated, please fill in the config.yaml');
    }

    /** Persist the current configuration back to the yaml file. */
    save() {
        fs.writeFileSync(this.configPath, yaml.dump(this.config));
    }

    /**
     * Store an OJ credential obtained at runtime (fetcher login). The value
     * lives in memory only — save() must never be fed credentials, and no
     * code path persists the token to disk (rev.4 boundary ③).
     */
    setCredential(token: string) {
        this.config.token = token;
    }

    private loadArenaLayouts(): unknown[] {
        if (this.isClient || !this.config.arenaLayouts) return [];
        const logger = this.ctx.logger('init');
        const layoutsPath = path.resolve(process.cwd(), this.config.arenaLayouts);
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
    }
}

declare module 'cordis' {
    interface Context {
        config: ConfigService;
    }
}

export async function apply(ctx: Context) {
    const service = new ConfigService(ctx);
    if (service.firstRun) await service.writeTemplate();
}
