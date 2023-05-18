import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { yaml } from '@hydrooj/utils';

const hydroPath = path.resolve(os.homedir(), '.hydro');
fs.ensureDirSync(hydroPath);
const configPath = path.resolve(hydroPath, 'xcpc-tools.yaml');
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, 'type:\nuname:\npassword:\n');
    console.error('Please edit config file at', configPath);
    process.exit(1);
}
const config = yaml.load(configPath) as any;
if (!config.type || !config.uname || !config.password) {
    console.error('Please edit config file at', configPath);
    process.exit(1);
}



process.on('unhandledRejection', (e) => {
    console.error(e);
});
process.on('uncaughtException', (e) => {
    console.error(e);
});

