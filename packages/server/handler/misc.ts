// @ts-ignore
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Context } from 'cordis';
import { Registry } from 'prom-client';
import { BadRequestError, Handler, NotFoundError } from '@hydrooj/framework';
import { arenaLayouts, config, version } from '../config';
import { getNotifierStatuses } from '../service/notifier';
// @ts-ignore
import StaticFrontend from '../data/static.frontend';
import { normalizePresentationLogo } from '../service/presentation';
import {
    avatarDirectory,
    buildExport,
    commitImport,
    getPresentationRoster,
    getPresentationRosterStats,
    getPresentationTeamBySeat,
    inspectImport,
    normalizeSeat,
    previewImport,
    replaceFromOj,
    syncRegistryAvatars,
} from '../service/presentationRoster';
import {
    createMetricsRegistry, decodeBinary, fs, randomstring, StaticHTML,
} from '../utils';
import { CLIENT_ONLINE_WINDOW } from './printRouting';

const randomHash = randomstring(8).toLowerCase();
const buf = decodeBinary(StaticFrontend, 'static.frontend');
const PRESENTATION_ONLINE_WINDOW = 120_000;
const presentationConnections = new Map<string, number>();
let registry: Registry;

const connectedPresentationDevices = (now: number) => {
    for (const [device, lastConnectedAt] of presentationConnections) {
        if (lastConnectedAt <= now - PRESENTATION_ONLINE_WINDOW) presentationConnections.delete(device);
    }
    return presentationConnections.size;
};

const arenaLayoutsPath = () => path.resolve(process.cwd(), String(config.arenaLayouts || 'data/arena-layouts.json'));
const arenaRevision = (layouts: unknown = arenaLayouts) => createHash('sha256')
    .update(JSON.stringify(layouts))
    .digest('hex')
    .slice(0, 16);

const validateArenaLayouts = (input: unknown): any[] => {
    if (!Array.isArray(input)) throw new Error('layouts must be an array');
    if (input.length > 32) throw new Error('A maximum of 32 layouts is supported');
    const layoutIds = new Set<string>();
    let defaultCount = 0;
    return input.map((source: any, layoutIndex) => {
        if (!source || typeof source !== 'object') throw new Error(`Layout ${layoutIndex + 1} is invalid`);
        const id = String(source.id || '').trim();
        const name = String(source.name || '').trim();
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`Layout ${layoutIndex + 1} has an invalid id`);
        if (!name || name.length > 128) throw new Error(`Layout ${id} has an invalid name`);
        if (layoutIds.has(id)) throw new Error(`Layout id ${id} is duplicated`);
        layoutIds.add(id);
        if (source.default === true) defaultCount += 1;
        if (!Array.isArray(source.sections) || !source.sections.length) throw new Error(`Layout ${id} has no sections`);
        const seats = new Set<string>();
        const sectionIds = new Set<string>();
        let seatCount = 0;
        let cellCount = 0;
        const sections = source.sections.map((section: any, sectionIndex: number) => {
            if (!section || typeof section !== 'object' || !Array.isArray(section.grid) || !section.grid.length) {
                throw new Error(`Layout ${id}, section ${sectionIndex + 1} has no grid`);
            }
            const width = section.grid.reduce((maxWidth: number, row: unknown) => (
                Math.max(maxWidth, Array.isArray(row) ? row.length : 0)
            ), 0);
            if (!width) throw new Error(`Layout ${id}, section ${sectionIndex + 1} is empty`);
            const sectionCells = width * section.grid.length;
            if (cellCount + sectionCells > 100_000) throw new Error(`Layout ${id} contains more than 100,000 cells`);
            cellCount += sectionCells;
            const grid = section.grid.map((row: unknown, rowIndex: number) => {
                if (!Array.isArray(row)) throw new Error(`Layout ${id}, row ${rowIndex + 1} is invalid`);
                return Array.from({ length: width }, (_, cellIndex) => {
                    const value = row[cellIndex];
                    if (value === undefined || value === null || value === '') return null;
                    if (typeof value !== 'string') throw new Error(`Layout ${id} contains a non-string seat`);
                    if (value.length > 64) throw new Error(`Layout ${id} contains a seat longer than 64 characters`);
                    const seat = value.trim();
                    if (!seat) return null;
                    const normalized = seat.toUpperCase();
                    if (seats.has(normalized)) throw new Error(`Layout ${id} contains duplicate seat ${seat}`);
                    seats.add(normalized);
                    seatCount += 1;
                    if (seatCount > 100_000) throw new Error(`Layout ${id} contains too many seats`);
                    return seat;
                });
            });
            const sectionId = String(section.id || `${id}-section-${sectionIndex + 1}`).trim();
            if (!/^[A-Za-z0-9_-]{1,96}$/.test(sectionId)) throw new Error(`Layout ${id} has an invalid section id`);
            if (sectionIds.has(sectionId)) throw new Error(`Layout ${id} contains duplicate section id ${sectionId}`);
            sectionIds.add(sectionId);
            return {
                ...section,
                id: sectionId,
                grid,
                ...section.seatSize !== undefined && { seatSize: Math.max(12, Math.min(160, Number(section.seatSize) || 36)) },
                ...section.gapSize !== undefined && { gapSize: Math.max(0, Math.min(64, Number(section.gapSize) || 0)) },
            };
        });
        if (!seatCount) throw new Error(`Layout ${id} contains no seats`);
        return {
            ...source,
            id,
            name,
            description: source.description ? String(source.description).slice(0, 512) : undefined,
            sections,
        };
    }).map((layout) => {
        if (defaultCount <= 1) return layout;
        throw new Error('Only one layout can be the default');
    });
};

const saveArenaLayouts = (layouts: any[]) => {
    const target = arenaLayoutsPath();
    fs.ensureDirSync(path.dirname(target));
    const content = `${JSON.stringify(layouts, null, 2)}\n`;
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(temporary, content, { mode: 0o600 });
        fs.renameSync(temporary, target);
    } finally {
        if (fs.existsSync(temporary)) fs.removeSync(temporary);
    }
    arenaLayouts.splice(0, arenaLayouts.length, ...layouts);
};

class StaticHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'public');
        this.response.addHeader('Expires', new Date(new Date().getTime() + 86400000).toUTCString());
        this.response.type = 'text/javascript';
        this.binary(buf, 'main.js');
    }
}

export class AuthHandler extends Handler {
    async prepare() {
        if (!this.request.headers.authorization) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication required';
            return 'cleanup';
        }
        const [uname, pass] = Buffer.from(this.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
        if (uname !== 'admin' || pass !== config.viewPass.toString()) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication failed';
            return 'cleanup';
        }
        return '';
    }
}

const toTimestamp = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
    const timestamp = new Date(value as any).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
};

const ojConnected = (ctx: Context) => config.type !== 'server'
    && Number(ctx.fetcher?.sourceSuccessAt || 0) > Date.now() - 45_000
    && Number(ctx.fetcher?.sourceSuccessAt || 0) >= Number(ctx.fetcher?.sourceErrorAt || 0);

const contestOverview = async (ctx: Context) => {
    const source = ctx.fetcher?.contest;
    const hasContest = Boolean(config.type !== 'server' && source?.id && source.id !== 'server-mode');
    const connected = Boolean(hasContest && ojConnected(ctx));
    const roster = getPresentationRoster();
    const [monitors, serviceClients] = await Promise.all([
        ctx.db.monitor.find({}),
        ctx.db.client.find({}).sort({ createAt: 1 }),
    ]);
    const onlineSeats = new Set<string>();
    const now = Date.now();
    for (const monitor of monitors) {
        if (Number(monitor.updateAt) <= now - 120_000) continue;
        for (const value of [monitor.name, monitor.hostname].map(normalizeSeat).filter(Boolean)) {
            onlineSeats.add(value);
        }
    }
    const info = source?.info || {};
    const startAt = toTimestamp(info.start_time ?? info.beginAt ?? info.startAt ?? info.start_at ?? info.begin_time);
    let endAt = toTimestamp(info.end_time ?? info.endAt ?? info.end_at ?? info.endTime);
    if (!endAt && startAt && Number(info.duration) > 0) {
        const duration = Number(info.duration);
        endAt = startAt + (duration < 100_000 ? duration * 1000 : duration);
    }
    const freezeAt = toTimestamp(info.freeze_time ?? info.lockAt ?? info.freezeAt ?? info.scoreboard_freeze_time);
    const ojTeams = hasContest ? (await ctx.db.teams.find({})).filter((team) => !team.hidden) : [];
    const rosterStats = getPresentationRosterStats();
    const clientOverview = serviceClients.map((client) => {
        const printers = Array.isArray(client.printers) ? client.printers : [];
        const printersInfo = Array.isArray(client.printersInfo) ? client.printersInfo : [];
        return {
            name: String(client.name || 'Client'),
            services: Array.isArray(client.type) ? client.type : [],
            ip: String(client.ip || ''),
            lastConnectedAt: Number(client.updateAt || 0),
            online: Number(client.updateAt || 0) >= now - CLIENT_ONLINE_WINDOW,
            printers: printers.map((printer) => {
                const info = printersInfo.find((item) => item.printer === printer);
                return {
                    name: String(printer),
                    description: String(info?.description || ''),
                    status: String(info?.status || 'unknown'),
                    group: String(info?.group || '').trim().toUpperCase(),
                };
            }),
        };
    });
    return {
        mode: config.type,
        connected,
        connectionError: connected ? '' : String(ctx.fetcher?.sourceError || '').slice(0, 240),
        contest: hasContest ? {
            id: String(source.id),
            name: String(source.name || info.name || info.title || ''),
            startAt,
            endAt,
            freezeAt,
        } : null,
        roster: {
            total: roster.teams.length,
            schools: rosterStats.schools,
            onlineIpMatches: roster.teams.filter((team) => onlineSeats.has(team.seat)).length,
            noLogos: roster.teams.filter((team) => !team.logo).length,
            source: roster.source,
            sourceContestId: roster.sourceContestId,
            revision: roster.revision,
            updatedAt: roster.updatedAt,
        },
        ojTeams: ojTeams.length,
        presentation: {
            connectedTeams: connectedPresentationDevices(now),
        },
        clients: {
            services: clientOverview,
            webhooks: getNotifierStatuses(),
        },
        serverTime: now,
    };
};

class HomeHandler extends AuthHandler {
    async get() {
        const context = {
            secretRoute: config.secretRoute,
            contest: this.ctx.fetcher?.contest || { name: 'Server Mode' },
            arenaLayouts,
            sshEnabled: config.ssh.enabled,
        };
        if (this.request.headers.accept === 'application/json') {
            this.response.body = context;
        } else {
            this.response.type = 'text/html';
            this.response.body = StaticHTML(context, randomHash);
        }
    }
}

class PresentationHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        this.response.addHeader('Access-Control-Allow-Origin', '*');
        this.response.addHeader('Access-Control-Allow-Methods', 'GET');
        this.response.addHeader('Cache-Control', 'no-store');
        const source = this.ctx.fetcher?.contest || { name: 'XCPC Tools', id: 'server-mode' };
        const info = source.info || {};
        const roster = getPresentationRoster();
        const rosterStats = getPresentationRosterStats();
        const seat = normalizeSeat(this.request.query?.seat);
        const matched = getPresentationTeamBySeat(seat);
        const clientIp = String(this.request.ip || '').replace(/^::ffff:/, '').slice(0, 64);
        const startAt = toTimestamp(info.start_time ?? info.beginAt ?? info.startAt ?? info.start_at ?? info.begin_time);
        let endAt = toTimestamp(info.end_time ?? info.endAt ?? info.end_at ?? info.endTime);
        if (!endAt && startAt && Number(info.duration) > 0) {
            const duration = Number(info.duration);
            endAt = startAt + (duration < 100_000 ? duration * 1000 : duration);
        }
        const serverTime = Date.now();
        if (seat || clientIp) presentationConnections.set(seat || clientIp, serverTime);
        this.response.body = {
            contest: {
                id: String(source.id || 'server-mode'),
                name: String(source.name || info.name || info.title || 'XCPC Tools'),
                startAt,
                endAt,
            },
            teams: rosterStats.teams,
            schools: rosterStats.schools,
            connected: ojConnected(this.ctx),
            clientIp,
            serverTime,
            team: matched ? {
                name: String(matched.displayName || matched.name || '').slice(0, 160),
                school: String(matched.school || matched.organizationId || '').slice(0, 160),
                seat,
                logo: normalizePresentationLogo(matched.logo),
            } : null,
            updatedAt: roster.updatedAt || serverTime,
        };
    }
}

class OverviewHandler extends AuthHandler {
    async get() {
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.body = await contestOverview(this.ctx);
    }
}

const asBadRequest = (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestError(message.slice(0, 500));
};

class PresentationTeamsHandler extends AuthHandler {
    async get() {
        const overview = await contestOverview(this.ctx);
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.body = {
            ...getPresentationRoster(),
            ojAvailable: config.type !== 'server' && Boolean(overview.contest),
            ojConnected: overview.connected,
            contest: overview.contest,
        };
    }

    async postFromOj() {
        const overview = await contestOverview(this.ctx);
        if (config.type === 'server' || !overview.contest) throw new BadRequestError('Configure Hydro or DOMjudge before loading teams');
        try {
            await this.ctx.fetcher.teamInfo();
            const teams = await this.ctx.db.teams.find({});
            if (!teams.some((team) => !team.hidden)) throw new Error('The OJ team list is empty');
            const { document, skipped } = await replaceFromOj(teams, overview.contest?.id || '');
            this.response.body = { ...document, skipped };
        } catch (error) {
            asBadRequest(error);
        }
    }

    async postImportPreview(params) {
        try {
            this.response.body = previewImport(params.content, params.format, params.mode, params.mapping);
        } catch (error) {
            asBadRequest(error);
        }
    }

    async postImportInspect(params) {
        try {
            this.response.body = inspectImport(params.content, params.format);
        } catch (error) {
            asBadRequest(error);
        }
    }

    async postImportCommit(params) {
        try {
            this.response.body = await commitImport(
                params.content,
                params.format,
                params.mode,
                params.revision,
                params.mapping,
            );
        } catch (error) {
            asBadRequest(error);
        }
    }

    async postSyncAvatars() {
        try {
            this.response.body = await syncRegistryAvatars();
        } catch (error) {
            asBadRequest(error);
        }
    }

    async postExport(params) {
        const monitors = await this.ctx.db.monitor.find({});
        const result = buildExport(monitors, params.format);
        this.response.type = result.type;
        this.response.disposition = `attachment; filename="presentation-teams.${result.extension}"`;
        this.response.addHeader('X-Presentation-Total', String(result.summary.total));
        this.response.addHeader('X-Presentation-Matched', String(result.summary.matched));
        this.response.addHeader('X-Presentation-Missing', String(result.summary.missing));
        this.response.addHeader('X-Presentation-Ambiguous', String(result.summary.ambiguous));
        this.response.body = result.content;
    }

    async postExportPreview() {
        const monitors = await this.ctx.db.monitor.find({});
        this.response.body = buildExport(monitors, 'json').summary;
    }
}

class PresentationAssetHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get(params) {
        const filename = String(params.filename || '');
        if (!/^[a-f0-9]{64}\.webp$/.test(filename)) throw new NotFoundError();
        const asset = path.join(avatarDirectory, filename);
        if (!fs.existsSync(asset)) throw new NotFoundError();
        this.binary(fs.readFileSync(asset));
        this.response.type = 'image/webp';
        this.response.disposition = 'inline';
        this.response.addHeader('Access-Control-Allow-Origin', '*');
        this.response.addHeader('Access-Control-Allow-Methods', 'GET, HEAD');
        this.response.addHeader('Cache-Control', 'public, max-age=31536000, immutable');
        this.response.addHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
    }
}
class MetricsHandler extends AuthHandler {
    notUsage = true;

    async get() {
        if (this.request.json) {
            this.response.body = await registry.getMetricsAsJSON();
            return;
        }
        this.response.body = await registry.metrics();
        this.response.type = 'text/plain';
    }
}

class ArenaLayoutsHandler extends AuthHandler {
    async get() {
        const revision = arenaRevision();
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.addHeader('ETag', `"${revision}"`);
        this.response.body = {
            revision,
            layouts: arenaLayouts,
        };
    }

    async post(params) {
        const expectedRevision = String(params?.revision || '');
        const currentRevision = arenaRevision();
        if (!expectedRevision || expectedRevision !== currentRevision) {
            this.response.status = 409;
            this.response.body = {
                error: 'Arena layouts changed on the server. Reload them before saving.',
                revision: currentRevision,
            };
            return;
        }
        try {
            const layouts = validateArenaLayouts(params?.layouts);
            saveArenaLayouts(layouts);
            const revision = arenaRevision();
            this.response.addHeader('Cache-Control', 'no-store');
            this.response.addHeader('ETag', `"${revision}"`);
            this.response.body = {
                success: true,
                revision,
                layouts: arenaLayouts,
            };
        } catch (error) {
            this.response.status = 400;
            this.response.body = { error: error instanceof Error ? error.message : 'Invalid arena layouts' };
        }
    }
}

class VersionHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        this.response.body = {
            program: '@hydro/xcpc-tools',
            version,
        };
        this.response.addHeader('Access-Control-Allow-Origin', '*');
        this.response.addHeader('Access-Control-Allow-Methods', 'GET');
        this.response.addHeader('Access-Control-Allow-Headers', 'Content-Type');
        this.response.addHeader('Cache-Control', 'no-store');
    }
}

export async function apply(ctx: Context) {
    registry = createMetricsRegistry(ctx);
    ctx.Route('home', '/', HomeHandler);
    ctx.Route('presentation', '/presentation', PresentationHandler);
    ctx.Route('overview', '/overview', OverviewHandler);
    ctx.Route('presentation_teams', '/presentation-teams', PresentationTeamsHandler);
    ctx.Route('presentation_assets', '/presentation-assets/:filename', PresentationAssetHandler);
    ctx.Route('static', '/main.js', StaticHandler);
    ctx.Route('metrics', '/metrics', MetricsHandler);
    ctx.Route('arena_layouts', '/arena-layouts', ArenaLayoutsHandler);
    ctx.Route('version', '/version', VersionHandler);
}
