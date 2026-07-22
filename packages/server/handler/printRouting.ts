export const CLIENT_ONLINE_WINDOW = 20_000;

export interface PrinterTarget {
    clientId: string;
    clientName: string;
    printer: string;
    group: string;
}

export interface PrinterClientState {
    id: string;
    name?: string;
    type?: string[];
    updateAt?: number;
    printers?: string[];
    printersInfo?: Array<{ printer: string; status?: string; group?: string }>;
}

const OPERATIONAL_PRINTER_STATUSES = new Set(['idle']);

export const normalizePrintGroup = (value: unknown) => String(value ?? '').trim().toUpperCase();

export function collectPrinterTargets(clients: PrinterClientState[]): PrinterTarget[] {
    const targets: PrinterTarget[] = [];
    for (const client of clients) {
        if (Array.isArray(client.type) && !client.type.includes('printer')) continue;
        for (const printer of client.printers || []) {
            const info = client.printersInfo?.find((item) => item.printer === printer);
            targets.push({
                clientId: client.id,
                clientName: client.name || client.id,
                printer,
                group: normalizePrintGroup(info?.group),
            });
        }
    }
    return targets;
}

export function clientHasTargetPrinter(client: PrinterClientState | undefined, printer: string, now = Date.now()) {
    if (!client?.updateAt || client.updateAt < now - CLIENT_ONLINE_WINDOW) return false;
    if (!client.printers?.includes(printer)) return false;
    const info = client.printersInfo?.find((item) => item.printer === printer);
    return OPERATIONAL_PRINTER_STATUSES.has(String(info?.status || '').trim().toLowerCase());
}

export function printCandidates(targets: PrinterTarget[], group: unknown, location: unknown) {
    const requestedGroup = normalizePrintGroup(group);
    const grouped = requestedGroup
        ? targets.filter((target) => target.group === requestedGroup)
        : targets
            .filter((target) => target.group && normalizePrintGroup(location).startsWith(target.group))
            .sort((left, right) => right.group.length - left.group.length);
    return [
        ...grouped,
        ...targets.filter((target) => !target.group),
    ];
}

export function resolvePrinterTarget(
    targets: PrinterTarget[],
    states: Map<string, PrinterClientState>,
    group: unknown,
    location: unknown,
    preferredPrinter = '',
    now = Date.now(),
) {
    return printCandidates(targets, group, location).find((target) => (
        (!preferredPrinter || target.printer === preferredPrinter)
        && clientHasTargetPrinter(states.get(target.clientId), target.printer, now)
    ));
}
