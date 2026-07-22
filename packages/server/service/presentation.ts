const presentationAssetPattern = /^\/presentation-assets\/[a-f0-9]{64}\.webp$/i;

const assetCandidates = (value: unknown) => (Array.isArray(value) ? value : [value])
    .map((item: any) => ({
        href: typeof item === 'string' ? item : item?.href || item?.url || '',
        mime: typeof item === 'object' ? String(item?.mime || item?.type || '') : '',
        area: typeof item === 'object' ? Number(item?.width || 0) * Number(item?.height || 0) : 0,
    }))
    .filter((item) => item.href)
    .sort((a, b) => {
        const preferredA = /svg|png/i.test(a.mime) ? 1 : 0;
        const preferredB = /svg|png/i.test(b.mime) ? 1 : 0;
        return preferredB - preferredA || b.area - a.area;
    });

const safeHttpUrl = (value: string, baseUrl?: string) => {
    try {
        const asset = baseUrl ? new URL(value, baseUrl) : new URL(value);
        if (!['http:', 'https:'].includes(asset.protocol) || asset.username || asset.password) return '';
        asset.hash = '';
        return asset.toString();
    } catch {
        return '';
    }
};

export function normalizePresentationLogo(value: unknown): string {
    for (const candidate of assetCandidates(value)) {
        const href = String(candidate.href || '').trim();
        if (href.length > 2_048) continue;
        if (presentationAssetPattern.test(href)) return href.toLowerCase();
        const resolved = safeHttpUrl(href);
        if (resolved) return resolved;
    }
    return '';
}

export function resolvePublicAssetUrl(value: unknown, baseUrl: string): string {
    const candidates = assetCandidates(value);
    if (!candidates.length) return '';
    for (const candidate of candidates) {
        const resolved = safeHttpUrl(candidate.href, baseUrl);
        if (resolved) return resolved;
    }
    return '';
}

export function extractHydroTeams(body: any): any[] {
    if (!Array.isArray(body?.tsdocs) || !body?.udict || typeof body.udict !== 'object' || Array.isArray(body.udict)) {
        throw new Error('Hydro returned an invalid team list');
    }
    const teams = body.tsdocs.map((team: any) => {
        const uid = team?.uid;
        const user = uid === undefined || uid === null ? null : body.udict[uid];
        return user && typeof user === 'object' && !Array.isArray(user) ? user : null;
    }).filter((team): team is Record<string, any> => Boolean(team));
    if (body.tsdocs.length && !teams.length) throw new Error('Hydro returned no usable team records');
    return teams;
}
