const localPresentationAsset = /^\/presentation-assets\/[a-f0-9]{64}\.webp$/i;

const addCandidate = (candidates: string[], candidate: URL) => {
    if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) return;
    candidate.hash = '';
    const value = candidate.toString();
    if (!candidates.includes(value)) candidates.push(value);
};

export function resolvePresentationLogoCandidates(
    logo: string,
    responseUrl: string,
    pageProtocol: string,
) {
    const candidates: string[] = [];
    try {
        const response = new URL(responseUrl);
        const resolved = new URL(logo.trim(), response);
        const addUsableCandidate = (candidate: URL) => {
            if (pageProtocol === 'https:' && candidate.protocol === 'http:') {
                const upgraded = new URL(candidate);
                upgraded.protocol = 'https:';
                addCandidate(candidates, upgraded);
                return;
            }
            addCandidate(candidates, candidate);
        };
        if (localPresentationAsset.test(resolved.pathname)) {
            addUsableCandidate(new URL(`${resolved.pathname}${resolved.search}`, response.origin));
        }
        addUsableCandidate(resolved);
    } catch {
        return [];
    }
    return candidates;
}
