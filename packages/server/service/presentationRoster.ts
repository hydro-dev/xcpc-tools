import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import path from 'node:path';
import superagent from 'superagent';
import { formatError, fs } from '../utils';
import { normalizePresentationLogo } from './presentation';

export interface PresentationTeam {
    id: string;
    name: string;
    displayName: string;
    school: string;
    members: string[];
    coach: string;
    organizationId: string;
    seat: string;
    location: string;
    group: string;
    logo: string;
    importedIp: string;
    source: 'oj' | 'upload';
    sourceContestId: string;
    updatedAt: number;
}

interface PresentationRosterDocument {
    revision: string;
    updatedAt: number;
    source: 'oj' | 'upload' | 'empty';
    sourceContestId: string;
    teams: PresentationTeam[];
}

export interface ImportPreview {
    revision: string;
    errors: string[];
    warnings: string[];
    summary: {
        total: number;
        valid: number;
        added: number;
        updated: number;
        removed: number;
    };
}

export type ImportMappingField =
    | 'id' | 'name' | 'school' | 'seat'
    | 'member1' | 'member2' | 'member3'
    | 'coach' | 'group';
export type ImportMapping = Partial<Record<ImportMappingField, string>>;

export interface ImportInspection {
    columns: string[];
    suggestedMapping: ImportMapping;
}

interface ImportPreviewResult extends ImportPreview {
    teams: PresentationTeam[];
}

const rosterPath = path.resolve(process.cwd(), 'data/presentation-teams.json');
export const avatarDirectory = path.resolve(process.cwd(), 'data/presentation-avatars');
const maxTeams = 20_000;
const maxFieldLength = 2_048;
let writeLock = Promise.resolve();

const emptyDocument = (): PresentationRosterDocument => ({
    revision: '0', updatedAt: 0, source: 'empty', sourceContestId: '', teams: [],
});

const text = (value: unknown, max = maxFieldLength) => String(value ?? '').trim().slice(0, max);
export const normalizeSeat = (value: unknown) => text(
    value && typeof value === 'object' && !Array.isArray(value) ? (value as any).description : value,
    64,
).normalize('NFKC').toUpperCase();
const normalizeSchool = (value: unknown) => text(value, 160).normalize('NFKC');

const readInitialDocument = (): PresentationRosterDocument => {
    try {
        const parsed = fs.readJsonSync(rosterPath);
        if (!Array.isArray(parsed?.teams)) return emptyDocument();
        return {
            revision: text(parsed.revision, 128) || '0',
            updatedAt: Number(parsed.updatedAt) || 0,
            source: ['oj', 'upload'].includes(parsed.source) ? parsed.source : 'empty',
            sourceContestId: text(parsed.sourceContestId, 128),
            teams: parsed.teams.map((team: PresentationTeam) => ({
                ...team,
                members: (Array.isArray(team?.members) ? team.members : [])
                    .map((member) => text(member, 160))
                    .filter(Boolean)
                    .slice(0, 3),
                coach: text(team?.coach, 160),
                logo: normalizePresentationLogo(team?.logo),
            })),
        };
    } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
        return emptyDocument();
    }
};

let currentDocument = readInitialDocument();
let teamBySeat = new Map(currentDocument.teams.map((team) => [team.seat, team]));
let schoolCount = new Set(currentDocument.teams.map((team) => team.school || team.organizationId).filter(Boolean)).size;

const setCurrentDocument = (document: PresentationRosterDocument) => {
    currentDocument = document;
    teamBySeat = new Map(document.teams.map((team) => [team.seat, team]));
    schoolCount = new Set(document.teams.map((team) => team.school || team.organizationId).filter(Boolean)).size;
};

const nextRevision = (teams: PresentationTeam[]) => createHash('sha256')
    .update(`${Date.now()}\0${JSON.stringify(teams)}`)
    .digest('hex')
    .slice(0, 20);

const saveDocument = async (
    teams: PresentationTeam[],
    source: PresentationRosterDocument['source'],
    sourceContestId: string,
    expectedRevision?: string,
) => {
    const operation = writeLock.then(async () => {
        const current = currentDocument;
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
            throw new Error('Presentation roster changed after preview; preview the file again');
        }
        const updatedAt = Date.now();
        const document: PresentationRosterDocument = {
            revision: nextRevision(teams),
            updatedAt,
            source,
            sourceContestId,
            teams: teams.map((team) => ({
                ...team,
                source: source === 'oj' ? 'oj' : 'upload',
                sourceContestId,
                updatedAt,
            })),
        };
        fs.ensureDirSync(path.dirname(rosterPath));
        const temporary = `${rosterPath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeJsonSync(temporary, document, { spaces: 2 });
        await fs.move(temporary, rosterPath, { overwrite: true });
        setCurrentDocument(document);
        return document;
    });
    writeLock = operation.then(() => undefined, () => undefined);
    return operation;
};

const pick = (team: any, ...keys: string[]) => {
    for (const key of keys) if (team?.[key] !== undefined && team?.[key] !== null && team?.[key] !== '') return team[key];
    return '';
};

const parsePublicDescription = (value: unknown) => {
    const people = text(value).split(/[|/,，、]/).map((person) => text(person, 160)).filter(Boolean);
    const coach = people[people.length - 1] || '';
    const marker = /\s*[（(](?:教练|coach)[)）]\s*$/i;
    if (!marker.test(coach)) return { members: [], coach: '' };
    return {
        members: people.slice(0, -1).slice(0, 3),
        coach: coach.replace(marker, '').trim(),
    };
};

export const normalizePresentationTeam = (
    team: any,
    source: PresentationTeam['source'],
    sourceContestId = '',
): PresentationTeam => {
    const seat = normalizeSeat(pick(team, 'seat', 'location', 'studentId', 'room', 'romm'));
    const school = normalizeSchool(pick(team, 'school', 'affiliation', 'organization_name', 'organization'));
    const groupIds = Array.isArray(team?.group_ids) ? team.group_ids : [];
    const explicitGroup = pick(team, 'group', 'location_group', 'group_id');
    const group = explicitGroup === '' ? groupIds[0] : explicitGroup;
    const description = parsePublicDescription(team?.public_description);
    const explicitMembers = (Array.isArray(team?.members)
        ? team.members
        : [
            pick(team, 'member1', 'member_1', 'contestant1'),
            pick(team, 'member2', 'member_2', 'contestant2'),
            pick(team, 'member3', 'member_3', 'contestant3'),
        ])
        .map((member) => text(member, 160))
        .filter(Boolean)
        .slice(0, 3);
    const members = explicitMembers.length ? explicitMembers : description.members;
    return {
        id: text(pick(team, 'id', '_id', 'team_id'), 128),
        name: text(pick(team, 'name', 'team_name', 'uname'), 160),
        displayName: text(pick(team, 'displayName', 'display_name', 'name', 'team_name', 'uname'), 160),
        school,
        members,
        coach: text(pick(team, 'coach', 'coach_name'), 160) || description.coach,
        organizationId: text(pick(team, 'organizationId', 'organization_id'), 128),
        seat,
        location: normalizeSeat(pick(team, 'location', 'seat', 'studentId', 'room', 'romm')) || seat,
        group: text(group, 64),
        logo: normalizePresentationLogo(pick(team, 'logo', 'avatar', 'schoolLogo')),
        importedIp: text(pick(team, 'importedIp', 'ip'), 64),
        source,
        sourceContestId: text(sourceContestId, 128),
        updatedAt: Date.now(),
    };
};

const validateTeams = (teams: PresentationTeam[], requireSeat = true) => {
    const errors: string[] = [];
    const idRows = new Map<string, number>();
    const seatRows = new Map<string, number>();
    if (teams.length > maxTeams) errors.push(`Too many teams: ${teams.length}; maximum is ${maxTeams}`);
    for (const [index, team] of teams.entries()) {
        const row = index + 1;
        if (!team.id) errors.push(`Row ${row}: id is required`);
        if (!team.name) errors.push(`Row ${row}: name is required`);
        if (requireSeat && !team.seat) errors.push(`Row ${row}: seat or location is required`);
        if (team.importedIp && !isIP(team.importedIp)) errors.push(`Row ${row}: ip is invalid`);
        if (team.id) {
            if (idRows.has(team.id)) errors.push(`Rows ${idRows.get(team.id)} and ${row}: duplicate id ${team.id}`);
            else idRows.set(team.id, row);
        }
        if (team.seat) {
            if (seatRows.has(team.seat)) errors.push(`Rows ${seatRows.get(team.seat)} and ${row}: duplicate seat ${team.seat}`);
            else seatRows.set(team.seat, row);
        }
    }
    return errors.slice(0, 200);
};

const parseDelimitedRows = (content: string, delimiter: ',' | '\t'): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    const source = content.replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quoted) {
            if (char === '"' && source[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"') quoted = true;
        else if (char === delimiter) {
            row.push(field);
            field = '';
        } else if (char === '\n') {
            row.push(field.replace(/\r$/, ''));
            if (row.some((cell) => cell.length)) rows.push(row);
            row = [];
            field = '';
        } else field += char;
    }
    if (quoted) throw new Error('The file contains an unterminated quoted field');
    row.push(field.replace(/\r$/, ''));
    if (row.some((cell) => cell.length)) rows.push(row);
    return rows;
};

const rowsToObjects = (rows: string[][]) => {
    if (!rows.length) return { columns: [], rows: [] };
    const columns = rows[0].map((header) => header.trim());
    if (columns.some((header) => !header)) throw new Error('Every column must have a header');
    const seen = new Set<string>();
    for (const column of columns) {
        if (seen.has(column)) throw new Error(`Duplicate column header: ${column}`);
        seen.add(column);
    }
    return {
        columns,
        rows: rows.slice(1).map((values) => Object.fromEntries(
            columns.map((header, index) => [header, values[index] ?? '']),
        )),
    };
};

const parseRawImport = (content: unknown, format: unknown): { columns: string[]; rows: any[] } => {
    if (typeof content !== 'string' || !content.trim()) throw new Error('The uploaded file is empty');
    if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('The uploaded file is larger than 8MB');
    const normalizedFormat = String(format).toLowerCase();
    if (normalizedFormat === 'csv' || normalizedFormat === 'tsv') {
        return rowsToObjects(parseDelimitedRows(content, normalizedFormat === 'tsv' ? '\t' : ','));
    }
    if (normalizedFormat !== 'json') throw new Error('Only JSON, CSV, and TSV files are supported');
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    const teams = Array.isArray(parsed) ? parsed : parsed?.teams;
    if (!Array.isArray(teams)) throw new Error('JSON must be an array or an object containing a teams array');
    if (teams.some((team) => !team || typeof team !== 'object' || Array.isArray(team))) {
        throw new Error('Every JSON team entry must be an object');
    }
    return {
        columns: [...new Set(teams.flatMap((team) => Object.keys(team)))],
        rows: teams,
    };
};

const mappingAliases: Record<ImportMappingField, string[]> = {
    id: ['id', 'team_id', 'team id', '队伍id', '序号', '编号'],
    name: ['displayname', 'display_name', '中文队名', 'team_name', 'team name', '队名', 'name', '英文队名'],
    school: ['school', 'affiliation', 'organization_name', 'organization', '所属学校', '学校'],
    seat: ['seat', 'location', 'studentid', 'student_id', 'room', '座位', '座位号'],
    member1: ['member1', 'member_1', 'member 1', 'members', 'contestant1', '队员1姓名', '队员1', '选手1'],
    member2: ['member2', 'member_2', 'member 2', 'contestant2', '队员2姓名', '队员2', '选手2'],
    member3: ['member3', 'member_3', 'member 3', 'contestant3', '队员3姓名', '队员3', '选手3'],
    coach: ['coach', 'coach_name', '教练姓名', '教练'],
    group: ['group', 'location_group', 'group_id', '组别', '占用名额类型'],
};

const normalizedHeader = (value: string) => value.trim().normalize('NFKC').toLowerCase();

const suggestImportMapping = (columns: string[]): ImportMapping => {
    const normalizedColumns = new Map(columns.map((column) => [normalizedHeader(column), column]));
    return Object.fromEntries(Object.entries(mappingAliases).flatMap(([field, aliases]) => {
        const column = aliases.map((alias) => normalizedColumns.get(normalizedHeader(alias))).find(Boolean);
        return column ? [[field, column]] : [];
    }));
};

const mappedValue = (row: any, column: string | undefined) => (column ? row?.[column] : '');

const applyImportMapping = (rows: any[], mapping: ImportMapping) => {
    if (!mapping.name) throw new Error('Select the column containing the team name');
    if (!mapping.seat) throw new Error('Select the column containing the seat');
    return rows.map((row, index) => {
        const seat = mappedValue(row, mapping.seat);
        const name = mappedValue(row, mapping.name);
        const members = (['member1', 'member2', 'member3'] as const).flatMap((field) => {
            const value = mappedValue(row, mapping[field]);
            return Array.isArray(value) ? value : [value];
        }).filter((member) => member !== undefined && member !== null && member !== '').slice(0, 3);
        return {
            id: mappedValue(row, mapping.id) || seat || `row-${index + 1}`,
            name,
            displayName: name,
            school: mappedValue(row, mapping.school),
            seat,
            location: seat,
            members,
            coach: mappedValue(row, mapping.coach),
            group: mappedValue(row, mapping.group),
            organizationId: pick(row, 'organizationId', 'organization_id'),
            logo: pick(row, 'logo', 'avatar', 'schoolLogo'),
            importedIp: pick(row, 'importedIp', 'ip'),
        };
    });
};

export const inspectImport = (content: unknown, format: unknown): ImportInspection => {
    const parsed = parseRawImport(content, format);
    return { columns: parsed.columns, suggestedMapping: suggestImportMapping(parsed.columns) };
};

export const parseImport = (content: unknown, format: unknown, mapping?: ImportMapping): any[] => {
    const parsed = parseRawImport(content, format);
    return mapping ? applyImportMapping(parsed.rows, mapping) : parsed.rows;
};

export const getPresentationRoster = () => currentDocument;
export const getPresentationRosterStats = () => ({ teams: currentDocument.teams.length, schools: schoolCount });

export const getPresentationTeamBySeat = (seat: unknown) => {
    const normalized = normalizeSeat(seat);
    return teamBySeat.get(normalized) || null;
};

const previewImportAgainst = (
    current: PresentationRosterDocument,
    content: unknown,
    format: unknown,
    mode: unknown,
    mapping?: ImportMapping,
): ImportPreviewResult => {
    const imported = parseImport(content, format, mapping).map((team) => normalizePresentationTeam(team, 'upload'));
    const errors = validateTeams(imported);
    const currentIds = new Set(current.teams.map((team) => team.id));
    const incomingIds = new Set(imported.map((team) => team.id));
    const merge = mode === 'merge';
    return {
        revision: current.revision,
        teams: errors.length ? [] : imported,
        errors,
        warnings: imported.filter((team) => !team.school).slice(0, 20).map((team) => `${team.id}: school is empty; no avatar can be matched`),
        summary: {
            total: imported.length,
            valid: errors.length ? 0 : imported.length,
            added: imported.filter((team) => !currentIds.has(team.id)).length,
            updated: imported.filter((team) => currentIds.has(team.id)).length,
            removed: merge ? 0 : current.teams.filter((team) => !incomingIds.has(team.id)).length,
        },
    };
};

export const previewImport = (
    content: unknown,
    format: unknown,
    mode: unknown,
    mapping?: ImportMapping,
): ImportPreview => {
    const preview = previewImportAgainst(currentDocument, content, format, mode, mapping);
    return {
        revision: preview.revision,
        errors: preview.errors,
        warnings: preview.warnings,
        summary: preview.summary,
    };
};

export const commitImport = async (
    content: unknown,
    format: unknown,
    mode: unknown,
    revision: unknown,
    mapping?: ImportMapping,
) => {
    const current = currentDocument;
    const preview = previewImportAgainst(current, content, format, mode, mapping);
    if (preview.errors.length) throw new Error(preview.errors[0]);
    let teams = preview.teams;
    if (mode === 'merge') {
        const merged = new Map(current.teams.map((team) => [team.id, team]));
        for (const team of preview.teams) merged.set(team.id, team);
        teams = [...merged.values()];
        const errors = validateTeams(teams);
        if (errors.length) throw new Error(errors[0]);
    }
    return saveDocument(teams, 'upload', '', text(revision, 128));
};

const ojSnapshotHash = (teams: PresentationTeam[]) => createHash('sha256')
    .update(JSON.stringify(teams, (key, value) => (key === 'updatedAt' ? undefined : value)))
    .digest('hex');

const prepareOjTeams = (teams: any[], contestId: unknown) => {
    const teamsWithCachedLogos = currentDocument.teams
        .filter((team) => team.logo.startsWith('/presentation-assets/'));
    const cachedLogosById = new Map(teamsWithCachedLogos.map((team) => [team.id, team.logo]));
    const cachedLogosBySchool = new Map(teamsWithCachedLogos
        .filter((team) => team.school)
        .map((team) => [normalizeSchool(team.school), team.logo]));
    const normalized = teams
        .filter((team) => !team.hidden)
        .map((team) => normalizePresentationTeam(team, 'oj', text(contestId, 128)));
    const snapshotHash = ojSnapshotHash(normalized);
    const prepared = normalized.map((team) => ({
        ...team,
        logo: cachedLogosById.get(team.id)
            || cachedLogosBySchool.get(normalizeSchool(team.school))
            || team.logo,
    }));
    const skipped = prepared.filter((team) => !team.seat);
    const assigned = prepared.filter((team) => team.seat);
    const errors = validateTeams(assigned);
    if (errors.length) throw new Error(errors[0]);
    return { assigned, skipped, snapshotHash };
};

const ojComparableFields = [
    'name', 'displayName', 'school', 'members', 'coach', 'organizationId',
    'seat', 'location', 'group', 'logo',
] as const;

const ojTeamSummary = (team: PresentationTeam) => ({
    id: team.id,
    name: team.displayName || team.name,
    seat: team.seat,
    school: team.school,
    members: team.members,
    coach: team.coach,
});

export const previewFromOj = (teams: any[], contestId: unknown) => {
    const { assigned, skipped, snapshotHash } = prepareOjTeams(teams, contestId);
    const currentById = new Map(currentDocument.teams.map((team) => [team.id, team]));
    const incomingIds = new Set(assigned.map((team) => team.id));
    const added = assigned.filter((team) => !currentById.has(team.id));
    const updated = assigned.flatMap((team) => {
        const current = currentById.get(team.id);
        if (!current) return [];
        const fields = ojComparableFields.filter((field) => JSON.stringify(current[field]) !== JSON.stringify(team[field]));
        return fields.length ? [{
            ...ojTeamSummary(team),
            previousSeat: current.seat,
            fields,
            changes: fields.map((field) => ({
                field,
                before: current[field],
                after: team[field],
            })),
        }] : [];
    });
    const removed = currentDocument.teams.filter((team) => !incomingIds.has(team.id));
    return {
        revision: currentDocument.revision,
        snapshotHash,
        summary: {
            current: currentDocument.teams.length,
            incoming: assigned.length,
            added: added.length,
            updated: updated.length,
            removed: removed.length,
            unchanged: assigned.length - added.length - updated.length,
            skipped: skipped.length,
        },
        added: added.map(ojTeamSummary),
        updated,
        removed: removed.map(ojTeamSummary),
        skipped: skipped.map(ojTeamSummary),
    };
};

export const replaceFromOj = async (
    teams: any[],
    contestId: unknown,
    expectedRevision?: unknown,
    expectedSnapshotHash?: unknown,
) => {
    const { assigned, skipped, snapshotHash } = prepareOjTeams(teams, contestId);
    if (expectedSnapshotHash !== undefined && snapshotHash !== text(expectedSnapshotHash, 128)) {
        throw new Error('OJ roster changed after preview; preview it again');
    }
    const revision = expectedRevision === undefined ? undefined : text(expectedRevision, 128);
    const document = await saveDocument(assigned, 'oj', text(contestId, 128), revision);
    return { document, skipped: skipped.length };
};

const safeRegistrySchool = (school: string) => {
    const normalized = normalizeSchool(school);
    if (!normalized || /[\\/\0]/.test(normalized) || normalized === '.' || normalized === '..') return '';
    return normalized;
};

const gitBlobSha = (body: Buffer) => createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');

const cachedAvatarSha = (logo: string) => {
    const match = /^\/presentation-assets\/([a-f0-9]{64}\.webp)$/i.exec(logo);
    if (!match) return '';
    const asset = path.join(avatarDirectory, match[1]);
    if (!fs.existsSync(asset)) return '';
    return gitBlobSha(fs.readFileSync(asset));
};

const downloadAvatar = async (school: string, expectedSha = '') => {
    const safeSchool = safeRegistrySchool(school);
    if (!safeSchool) throw new Error('invalid school name');
    const url = `https://raw.githubusercontent.com/hydro-dev/avatar-registry/main/avatars/${encodeURIComponent(safeSchool)}.webp?v=${expectedSha || Date.now()}`;
    const response = await superagent.get(url)
        .redirects(2)
        .buffer(true)
        .timeout({ response: 10_000, deadline: 20_000 })
        .ok((res) => res.status === 200);
    const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body || '');
    if (!body.length || body.length > 2 * 1024 * 1024) throw new Error('avatar exceeds the 2MB limit');
    if (expectedSha && gitBlobSha(body) !== expectedSha) throw new Error('avatar registry changed; retry the update');
    if (body.length < 12 || body.subarray(0, 4).toString('ascii') !== 'RIFF'
        || body.subarray(8, 12).toString('ascii') !== 'WEBP') throw new Error('avatar is not a WebP image');
    const filename = `${createHash('sha256').update(body).digest('hex')}.webp`;
    const destination = path.join(avatarDirectory, filename);
    fs.ensureDirSync(avatarDirectory);
    if (!fs.existsSync(destination)) {
        const temporary = `${destination}.${process.pid}.${createHash('sha256').update(safeSchool).digest('hex').slice(0, 12)}.tmp`;
        fs.writeFileSync(temporary, body);
        await fs.move(temporary, destination, { overwrite: true });
    }
    return `/presentation-assets/${filename}`;
};

export const syncRegistryAvatars = async () => {
    const current = currentDocument;
    const schools = [...new Set(current.teams.map((team) => safeRegistrySchool(team.school)).filter(Boolean))];
    if (!schools.length) return {
        document: current, matched: 0, updated: 0, cached: 0, failed: 0, failures: [],
    };
    let registryShas: Map<string, string> | null = null;
    let fallbackReason = '';
    try {
        const treeResponse = await superagent
            .get('https://api.github.com/repos/hydro-dev/avatar-registry/git/trees/main?recursive=1')
            .accept('application/vnd.github+json')
            .set('User-Agent', 'hydro-dev/xcpc-tools')
            .timeout({ response: 10_000, deadline: 20_000 })
            .ok((res) => res.status === 200);
        if (!Array.isArray(treeResponse.body?.tree) || treeResponse.body.truncated) {
            throw new Error('GitHub returned an incomplete avatar registry tree');
        }
        registryShas = new Map(treeResponse.body.tree
            .filter((entry: any) => entry.type === 'blob' && /^avatars\/[^/]+\.webp$/.test(entry.path))
            .map((entry: any) => [entry.path, String(entry.sha)]));
    } catch (error) {
        fallbackReason = formatError(error);
    }
    const currentLogos = new Map(current.teams
        .filter((team) => team.school && team.logo)
        .map((team) => [safeRegistrySchool(team.school), team.logo]));
    const logos = new Map<string, string>();
    const failures: Array<{ school: string; reason: string }> = [];
    let cached = 0;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, schools.length) }, async () => {
        // Each worker intentionally processes one bounded registry download at a time.
        while (cursor < schools.length) {
            const school = schools[cursor++];
            try {
                const expectedSha = registryShas?.get(`avatars/${school}.webp`) || '';
                if (registryShas && !expectedSha) throw new Error('not found in avatar registry');
                if (expectedSha && cachedAvatarSha(currentLogos.get(school) || '') === expectedSha) {
                    cached++;
                    continue;
                }
                // eslint-disable-next-line no-await-in-loop
                logos.set(school, await downloadAvatar(school, expectedSha));
            } catch (error: any) {
                failures.push({ school, reason: text(formatError(error), 200) });
            }
        }
    });
    await Promise.all(workers);
    const teams = current.teams.map((team) => {
        const school = safeRegistrySchool(team.school);
        return logos.has(school) ? { ...team, logo: logos.get(school)! } : team;
    });
    const document = logos.size
        ? await saveDocument(teams, current.source, current.sourceContestId, current.revision)
        : current;
    return {
        document,
        matched: cached + logos.size,
        updated: logos.size,
        cached,
        failed: failures.length,
        failures: failures.slice(0, 100),
        fallbackReason,
    };
};

export type TeamExportField =
    | 'id' | 'name' | 'display_name' | 'school'
    | 'member1' | 'member2' | 'member3' | 'coach'
    | 'organization_id' | 'seat' | 'location' | 'group' | 'ip' | 'logo';

export const teamExportFields: TeamExportField[] = [
    'id', 'name', 'display_name', 'school', 'member1', 'member2', 'member3',
    'coach', 'organization_id', 'seat', 'location', 'group', 'ip', 'logo',
];

const rosterWithIps = (monitors: any[]) => {
    const roster = currentDocument;
    const now = Date.now();
    const monitorBySeat = new Map<string, any[]>();
    for (const monitor of monitors.filter((item) => Number(item.updateAt) > now - 120_000)) {
        const seats = new Set([normalizeSeat(monitor.name), normalizeSeat(monitor.hostname)].filter(Boolean));
        for (const seat of seats) {
            monitorBySeat.set(seat, [...(monitorBySeat.get(seat) || []), monitor]);
        }
    }
    let matched = 0;
    let ambiguous = 0;
    const teams = roster.teams.map((team) => {
        const candidates = monitorBySeat.get(team.seat) || [];
        if (candidates.length === 1) matched++;
        else if (candidates.length > 1) ambiguous++;
        return { team, ip: candidates.length === 1 ? text(candidates[0].ip, 64) : '' };
    });
    const summary = {
        total: teams.length,
        matched,
        missing: teams.length - matched - ambiguous,
        ambiguous,
    };
    return { teams, summary };
};

export const buildAccountsExport = (monitors: any[]) => {
    const { teams, summary } = rosterWithIps(monitors);
    const accounts = teams.map(({ team, ip }) => ({
        id: team.id,
        username: team.id,
        name: team.displayName || team.name,
        type: 'team',
        ...(ip && { ip }),
        team_id: team.id,
    }));
    return {
        content: JSON.stringify(accounts, null, 2),
        type: 'application/json; charset=utf-8',
        filename: 'accounts.json',
        summary,
    };
};

const csvCell = (value: unknown) => {
    const cell = String(value ?? '');
    const safe = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replace(/"/g, '""')}"`;
};

export const buildTeamExport = (monitors: any[], format: unknown, requestedFields: unknown) => {
    const allowed = new Set(teamExportFields);
    const fields = [...new Set((Array.isArray(requestedFields) ? requestedFields : teamExportFields)
        .map((field) => String(field) as TeamExportField)
        .filter((field) => allowed.has(field)))];
    if (!fields.length) throw new Error('Select at least one field to export');
    const { teams, summary } = rosterWithIps(monitors);
    const rows = teams.map(({ team, ip }) => {
        const values: Record<TeamExportField, string> = {
            id: team.id,
            name: team.name,
            display_name: team.displayName,
            school: team.school,
            member1: team.members[0] || '',
            member2: team.members[1] || '',
            member3: team.members[2] || '',
            coach: team.coach,
            organization_id: team.organizationId,
            seat: team.seat,
            location: team.location,
            group: team.group,
            ip,
            logo: team.logo,
        };
        return Object.fromEntries(fields.map((field) => [field, values[field]]));
    });
    if (String(format).toLowerCase() === 'csv') {
        const csv = [fields.join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\r\n');
        return {
            content: `\uFEFF${csv}`,
            type: 'text/csv; charset=utf-8',
            filename: 'presentation-teams.csv',
            summary,
        };
    }
    return {
        content: JSON.stringify({ teams: rows, summary, exportedAt: Date.now() }, null, 2),
        type: 'application/json; charset=utf-8',
        filename: 'presentation-teams.json',
        summary,
    };
};
