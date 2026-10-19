export interface QuickNetworkConfig {
    ip?: string;
    gateway?: string;
    dns?: string[];
}

export interface QuickConfig {
    seat?: string;
    server?: string;
    network?: QuickNetworkConfig;
}

export function validIPv4(value: string) {
    return /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)
        && value.split('.').every((part) => Number(part) <= 255);
}

function optionalString(value: string | undefined, label: string) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`${label}必须是文本`);
    return value.trim() || undefined;
}

export function normalizeQuickConfig(source: QuickConfig): QuickConfig {
    const result: QuickConfig = {};
    const seat = optionalString(source.seat, '座位号');
    if (seat) {
        if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(seat)) throw new Error('座位号只能包含字母、数字和连字符，最长 63 个字符');
        result.seat = seat;
    }
    const server = optionalString(source.server, '中心地址');
    if (server) {
        let url: URL;
        try {
            if (/[|\s\\]/.test(server)) throw new Error('invalid');
            const shorthand = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/.test(server);
            const address = shorthand ? `http://${server}${server.includes(':') ? '' : ':5283'}/` : server;
            if (!/^https?:\/\//i.test(address)) throw new Error('invalid');
            url = new URL(address);
        } catch {
            throw new Error('中心地址必须是主机名、IP、主机:端口或完整 HTTP(S) 地址，不能包含空白或 |');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
            || /\/report\/?$/i.test(url.pathname)) {
            throw new Error('中心地址不能包含账号、查询参数、片段或 /report 后缀');
        }
        result.server = url.toString().replace(/\/*$/, '/');
    }
    if (source.network) {
        const input = source.network;
        const network: QuickNetworkConfig = {};
        const ip = optionalString(input.ip, 'IP/前缀');
        if (ip) {
            const [address, prefix, ...extra] = ip.split('/');
            if (!validIPv4(address) || !/^(?:[0-9]|[12]\d|3[0-2])$/.test(prefix || '') || extra.length) {
                throw new Error('IP 必须包含 0–32 的前缀长度，例如 10.0.0.12/24');
            }
            network.ip = ip;
        }
        const gateway = optionalString(input.gateway, '网关');
        if (gateway) {
            if (!validIPv4(gateway)) throw new Error('网关必须是有效的 IPv4 地址');
            network.gateway = gateway;
        }
        if (input.dns !== undefined) {
            if (!Array.isArray(input.dns) || input.dns.some((item) => typeof item !== 'string')) {
                throw new Error('DNS 必须是 IPv4 地址列表');
            }
            const dns = [...new Set(input.dns.map((item: string) => item.trim()).filter(Boolean))];
            if (dns.some((address) => !validIPv4(address))) throw new Error('DNS 必须是有效的 IPv4 地址');
            if (dns.length) network.dns = dns;
        }
        if (Object.keys(network).length) result.network = network;
    }
    if (!result.seat && !result.server && !result.network) throw new Error('二维码没有需要修改的配置');
    return result;
}

export function parseQuickConfig(text: string): QuickConfig {
    if (typeof text !== 'string' || !text || new TextEncoder().encode(text).length > 4096) {
        throw new Error('配置必须是 4096 字节以内的 xms1 文本');
    }
    const fields = text.split('|').map((field) => field.trim());
    if (fields.length !== 6 || fields[0] !== 'xms1' || /[\r\n]/.test(text)) {
        throw new Error('配置格式应为 xms1|座位|中心地址|IP/前缀|网关|DNS，空项保留分隔符');
    }
    const [, seat, server, ip, gateway, dns] = fields;
    if (Boolean(ip) !== Boolean(gateway)) throw new Error('IP/前缀和网关必须同时填写或同时留空');
    return normalizeQuickConfig({
        seat, server,
        network: { ip, gateway, dns: dns.split(',').filter(Boolean) },
    });
}
