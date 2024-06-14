/* eslint-disable no-empty-pattern */
/* eslint-disable no-await-in-loop */
import { Context } from 'cordis';
import { param, Types } from '@hydrooj/framework';
import { config } from '../config';
import { executeOnHost } from '../utils';
import { AuthHandler } from './misc';

class CommandsHandler extends AuthHandler {
    async get() {
        this.response.body = '';
    }

    @param('command', Types.String)
    async postCommand({ }, command: string) {
        this.response.body = this.executeForAll(command);
    }

    async executeForAll(command: string, t = 10000) {
        const allOnline = await this.ctx.db.monitor.find({});
        const result = await Promise.allSettled(allOnline.map((i) => executeOnHost(i.ip, command, t)));
        return {
            success: result.filter((i) => i.status === 'fulfilled').length,
            fail: result.filter((i) => i.status === 'rejected').length,
            result: result.map((i) => (i.status === 'fulfilled' ? i.value : i.reason)),
        };
    }

    async postShowIds() {
        this.response.body = await this.executeForAll(`
export ISAUTOLOGIN=$(cat /etc/gdm3/custom.conf | grep AutomaticLoginEnable | grep true)
if [ -z "$ISAUTOLOGIN" ]; then
    export DISPLAY=:1
else
    export DISPLAY=:0
fi
export XAUTHORITY=/run/user/1000/gdm/Xauthority
zenity --info --text "<span font='256'>$(cat ${config.seatFile})</span>"`);
    }

    async postSetHostname() {
        this.response.body = await this.executeForAll(`hostnamectl hostname $(cat -- ${config.seatFile})`);
    }

    async postAutologin({ }, autologin = false) {
        this.response.body = await this.executeForAll(`
cp /etc/gdm3/custom-${autologin ? 'autologin' : 'nologin'}.conf /etc/gdm3/custom.conf
systemctl restart gdm`);
    }

    async postReboot() {
        this.response.body = await this.executeForAll('reboot');
    }
}

export async function apply(ctx: Context) {
    ctx.Route('commands', '/commands', CommandsHandler);
}
