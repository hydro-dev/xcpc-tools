import path from 'path';
import { getPrinters } from 'unix-print';
import { fs, Logger, yaml } from '@hydrooj/utils';
const logger = new Logger('init');

const defaultFontConfig = {
    LXGWWenKai: 'LXGWWenKai-Regular.ttf',
    'Linux Libertine': 'LinLibertine-Regular.ttf',
};

export async function load() {
    try {
        logger.info('Loading config');
        const configPath = path.resolve(process.cwd(), 'config.yaml');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, `server: \ntype: \ntoken: \n${yaml.dump({ fonts: defaultFontConfig })}`);
            throw new Error('Config file generated, please fill in the config.yaml');
        }
        const {
            server, type, token, fonts,
        } = yaml.load(fs.readFileSync(configPath, 'utf8').toString()) as any;
        global.Tools = {
            config: {
                server,
                type,
                token,
                fonts,
            },
            version: require('./package.json').version,
        };
        logger.info(`XCPC-TOOLS Client Version: ${global.Tools.version}`);
        const config = global.Tools.config;
        logger.info(`Config loaded from ${configPath}`);
        if (!config.server) throw new Error('Server is required');
        if (!config.token) throw new Error('Please generate token on server and paste it in config.yaml');
        fs.ensureDirSync(path.resolve(process.cwd(), 'data'));
        if (fs.existsSync(path.resolve(process.cwd(), 'data/printer.json'))) {
            const printers = fs.readFileSync(path.resolve(process.cwd(), 'data/printer.json'), 'utf8');
            global.Tools.printers = JSON.parse(printers);
        } else {
            const printers = await getPrinters();
            global.Tools.printers = printers.map((p) => p.printer);
            fs.writeFileSync(path.resolve(process.cwd(), 'data/printer.json'), JSON.stringify(global.Tools.printers));
            throw new Error('Printer list generated at data/printer.json, please edit it and restart the client');
        }
    } catch (e) {
        logger.error(e);
        process.exit(1);
    }
}
