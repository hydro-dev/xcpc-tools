import {
    ActionIcon, Center, Group, Loader, Modal, Stack, Text, Tooltip,
} from '@mantine/core';
import {
    IconInfoCircle, IconSchool,
} from '@tabler/icons-react';
import {
    useCallback, useEffect, useRef, useState,
} from 'react';
import type {
    MachineSnapshot, MachineToolsConfig, PresentationData, ProbeServiceState,
} from '../types';
import { resolvePresentationLogoCandidates } from '../utils/presentation';
import {
    collectMachineSnapshot, getProbeServiceState, readMachineToolsConfig,
    readPresentationCache, removePresentationCache, writePresentationCache,
} from '../utils/system';
import { ParticleBackground } from './ParticleBackground';

interface PresentationRuntime {
    config: MachineToolsConfig;
    snapshot?: MachineSnapshot;
    probeServiceState: ProbeServiceState;
}

type ConnectionState = 'connecting' | 'online' | 'offline';

const LOGO_RETRY_INTERVAL = 15_000;
const PRESENTATION_REFRESH_INTERVAL = 60_000;

function isPresentationData(value: unknown): value is PresentationData {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<PresentationData>;
    const contest = candidate.contest;
    const team = candidate.team;
    return Boolean(
        contest
        && typeof contest.id === 'string'
        && typeof contest.name === 'string'
        && (contest.startAt === null
            || (typeof contest.startAt === 'number' && Number.isFinite(contest.startAt)))
        && (contest.endAt === null
            || (typeof contest.endAt === 'number' && Number.isFinite(contest.endAt)))
        && typeof candidate.teams === 'number'
        && Number.isFinite(candidate.teams)
        && typeof candidate.schools === 'number'
        && Number.isFinite(candidate.schools)
        && typeof candidate.connected === 'boolean'
        && typeof candidate.clientIp === 'string'
        && typeof candidate.serverTime === 'number'
        && Number.isFinite(candidate.serverTime)
        && typeof candidate.updatedAt === 'number'
        && Number.isFinite(candidate.updatedAt)
        && (team === null || (
            typeof team === 'object'
            && typeof team.name === 'string'
            && typeof team.school === 'string'
            && typeof team.seat === 'string'
            && typeof team.logo === 'string'
            && (team.logoCandidates === undefined
                || (Array.isArray(team.logoCandidates)
                    && team.logoCandidates.every((logo) => typeof logo === 'string')))
        ))
    );
}

function resolveTeamLogo(data: PresentationData, responseUrl: string): PresentationData {
    const team = data.team;
    const logo = team?.logo?.trim();
    if (!team || !logo) return data;
    const logoCandidates = resolvePresentationLogoCandidates(logo, responseUrl, window.location.protocol);
    return {
        ...data,
        team: { ...team, logo: logoCandidates[0] || '', logoCandidates },
    };
}

const presentationCacheKey = (data: PresentationData) => JSON.stringify({
    contest: data.contest,
    teams: data.teams,
    schools: data.schools,
    team: data.team,
});

const normalizeCacheSeat = (seat: unknown) => String(seat || '').trim().toUpperCase();

function formatClock(seconds: number | null) {
    if (seconds === null) return '--:--:--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatTimeOfDay(timestamp: number) {
    const date = new Date(timestamp);
    return [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
}

function useCountdown(target: number | null, clockOffset: number) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let timer: number;
        const tick = () => {
            const current = Date.now();
            setNow(current);
            const corrected = current + clockOffset;
            timer = window.setTimeout(tick, Math.max(100, 1_010 - (corrected % 1_000)));
        };
        tick();
        return () => window.clearTimeout(timer);
    }, [clockOffset]);

    const correctedNow = now + clockOffset;
    const currentClock = formatTimeOfDay(correctedNow);
    if (!target) return { clock: '--:--:--', currentClock, complete: false };
    const seconds = Math.max(0, Math.ceil((target - correctedNow) / 1_000));
    return { clock: formatClock(seconds), currentClock, complete: seconds === 0 };
}

function useDoNotTouchWarning(rootRef: React.RefObject<HTMLElement | null>) {
    const [visible, setVisible] = useState(false);
    const visibleRef = useRef(false);

    useEffect(() => {
        let warningTimer: number | undefined;
        let cursorTimer: number | undefined;

        const showWarning = () => {
            if (!visibleRef.current) {
                visibleRef.current = true;
                setVisible(true);
            }
            rootRef.current?.classList.remove('presentation-cursor-idle');
            window.clearTimeout(warningTimer);
            window.clearTimeout(cursorTimer);
            warningTimer = window.setTimeout(() => {
                visibleRef.current = false;
                setVisible(false);
            }, 3_000);
            cursorTimer = window.setTimeout(() => {
                rootRef.current?.classList.add('presentation-cursor-idle');
            }, 2_500);
        };

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
            showWarning();
        };

        const eventOptions = { passive: true } as const;
        window.addEventListener('pointermove', showWarning, eventOptions);
        window.addEventListener('pointerdown', showWarning, eventOptions);
        window.addEventListener('wheel', showWarning, eventOptions);
        window.addEventListener('touchstart', showWarning, eventOptions);
        window.addEventListener('keydown', showWarning);
        window.addEventListener('contextmenu', handleContextMenu);
        cursorTimer = window.setTimeout(() => {
            rootRef.current?.classList.add('presentation-cursor-idle');
        }, 2_500);

        return () => {
            window.clearTimeout(warningTimer);
            window.clearTimeout(cursorTimer);
            rootRef.current?.classList.remove('presentation-cursor-idle');
            window.removeEventListener('pointermove', showWarning);
            window.removeEventListener('pointerdown', showWarning);
            window.removeEventListener('wheel', showWarning);
            window.removeEventListener('touchstart', showWarning);
            window.removeEventListener('keydown', showWarning);
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [rootRef]);

    return visible;
}

function DoNotTouchWarning({ visible }: { visible: boolean }) {
    return (
        <div
            className={`do-not-touch-warning${visible ? ' do-not-touch-warning-visible' : ''}`}
            role="status"
            aria-live="polite"
            aria-hidden={!visible}
        >
            <div className="do-not-touch-panel">
                <img src="/szm_no.png" alt="" />
                <strong>DON&apos;T TOUCH MOUSE AND KEYBOARD</strong>
                <span>请勿触碰鼠标和键盘</span>
            </div>
        </div>
    );
}

interface PresentationFooterProps {
    toolsConnection: ConnectionState;
    ojConnection: ConnectionState;
    ip: string;
    onInfo: () => void;
}

function PresentationFooter({
    toolsConnection, ojConnection, ip, onInfo,
}: PresentationFooterProps) {
    return (
        <footer className="presentation-footer">
            <div className="presentation-machine-status">
                <div className="presentation-brand">
                    <img src="/hydro.png" alt="" aria-hidden="true" />
                    <span>Hydro Machine Tools</span>
                </div>
                <span
                    className={`presentation-connection presentation-connection-${toolsConnection}`}
                    title={`Tools: ${toolsConnection}`}
                >Tools</span>
                <span
                    className={`presentation-connection presentation-connection-${ojConnection}`}
                    title={`OJ: ${ojConnection}`}
                >OJ</span>
                <span>{ip}</span>
            </div>
            <Group gap="xs" wrap="nowrap">
                <Tooltip label="查看设备信息" position="top">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        className="presentation-footer-action"
                        aria-label="查看设备信息"
                        onClick={onInfo}
                    >
                        <IconInfoCircle size={21} stroke={1.8} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </footer>
    );
}

interface InfoRow {
    label: string;
    value: string;
    className?: string;
}

function PresentationInfoModal({
    opened, onClose, rows, error,
}: { opened: boolean; onClose: () => void; rows: InfoRow[]; error?: string }) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="设备状态"
            centered
            size="sm"
            classNames={{ content: 'presentation-info-modal', header: 'presentation-info-header' }}
        >
            <Stack gap="md" className="presentation-info-list">
                {rows.map((row) => (
                    <div key={row.label}>
                        <span>{row.label}</span>
                        <strong className={row.className}>{row.value}</strong>
                    </div>
                ))}
            </Stack>
            {error && <Text c="red" size="sm" mt="lg">最近一次连接失败：{error}</Text>}
        </Modal>
    );
}

export function PresentationPage() {
    const rootRef = useRef<HTMLElement>(null);
    const [runtime, setRuntime] = useState<PresentationRuntime>();
    const [data, setData] = useState<PresentationData>();
    const [clockOffset, setClockOffset] = useState(0);
    const [connection, setConnection] = useState<ConnectionState>('connecting');
    const [error, setError] = useState('');
    const [infoOpen, setInfoOpen] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const [logoCandidateIndex, setLogoCandidateIndex] = useState(0);
    const [logoRetry, setLogoRetry] = useState(0);
    const cacheKeyRef = useRef('');
    const cacheWriteInProgressRef = useRef(false);
    const warningVisible = useDoNotTouchWarning(rootRef);
    const logoCandidates = data?.team?.logoCandidates?.length
        ? data.team.logoCandidates
        : data?.team?.logo ? [data.team.logo] : [];
    const activeLogo = logoCandidates[logoCandidateIndex] || '';

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            readMachineToolsConfig(),
            collectMachineSnapshot().catch(() => undefined),
            getProbeServiceState(),
            readPresentationCache(),
        ]).then(([config, snapshot, probeServiceState, cache]) => {
            if (cancelled) return;
            setRuntime({ config, snapshot, probeServiceState });
            if (cache && cache.presentationUrl === config.presentationUrl
                && normalizeCacheSeat(cache.seat) === normalizeCacheSeat(config.seat)
                && isPresentationData(cache.data)) {
                cacheKeyRef.current = presentationCacheKey(cache.data);
                setData(cache.data);
                setClockOffset(Number.isFinite(cache.clockOffset) ? cache.clockOffset : 0);
                setConnection('offline');
                document.title = `${cache.data.team?.name || config.seat || 'Machine'} - ${cache.data.contest.name}`;
            }
        }).catch((reason) => {
            if (!cancelled) setError((reason as Error).message);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        setLogoFailed(false);
        setLogoCandidateIndex(0);
        setLogoRetry(0);
    }, [data?.team?.logo, data?.updatedAt]);

    useEffect(() => {
        if (!logoFailed || !logoCandidates.length) return undefined;
        const timer = window.setTimeout(() => {
            setLogoCandidateIndex(0);
            setLogoFailed(false);
            setLogoRetry((value) => value + 1);
        }, LOGO_RETRY_INTERVAL);
        return () => window.clearTimeout(timer);
    }, [logoCandidates.length, logoFailed]);

    const handleLogoError = useCallback(() => {
        if (logoCandidateIndex + 1 < logoCandidates.length) {
            setLogoCandidateIndex((value) => value + 1);
            return;
        }
        setLogoFailed(true);
    }, [logoCandidateIndex, logoCandidates.length]);

    useEffect(() => {
        const presentationUrl = runtime?.config.presentationUrl;
        if (!presentationUrl) return undefined;
        let cancelled = false;
        let pollTimer: number | undefined;
        let activeController: AbortController | undefined;

        const load = async () => {
            setConnection((current) => (current === 'offline' ? 'connecting' : current));
            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            const timeout = window.setTimeout(() => controller.abort(), 10_000);
            try {
                const url = new URL(presentationUrl);
                if (runtime.config.seat) url.searchParams.set('seat', runtime.config.seat);
                const startedAt = Date.now();
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) throw new Error(`比赛数据请求失败 (${response.status})`);
                const body: unknown = await response.json();
                if (!isPresentationData(body)) throw new Error('主服务器返回了无效的展示数据');
                const next = resolveTeamLogo(body, response.url);
                const completedAt = Date.now();
                const nextOffset = Number.isFinite(next.serverTime)
                    ? next.serverTime + (completedAt - startedAt) / 2 - completedAt
                    : 0;
                if (!cancelled) {
                    setData(next);
                    setClockOffset(nextOffset);
                    setConnection('online');
                    setError('');
                    document.title = `${next.team?.name || runtime.config.seat || 'Machine'} - ${next.contest.name}`;
                }
                const cacheKey = presentationCacheKey(next);
                if (cacheKey !== cacheKeyRef.current && !cacheWriteInProgressRef.current) {
                    cacheWriteInProgressRef.current = true;
                    writePresentationCache({
                        version: 1,
                        savedAt: Date.now(),
                        presentationUrl,
                        seat: normalizeCacheSeat(runtime.config.seat),
                        clockOffset: nextOffset,
                        data: next,
                    }).then(() => {
                        cacheKeyRef.current = cacheKey;
                    }).catch(() => undefined).finally(() => {
                        cacheWriteInProgressRef.current = false;
                    });
                }
            } catch (reason) {
                if (!cancelled) {
                    setConnection('offline');
                    setError((reason as Error).message);
                }
            } finally {
                window.clearTimeout(timeout);
                if (!cancelled) {
                    pollTimer = window.setTimeout(() => {
                        load();
                    }, PRESENTATION_REFRESH_INTERVAL);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
            window.clearTimeout(pollTimer);
            activeController?.abort();
            removePresentationCache();
        };
    }, [runtime]);

    const startAt = data?.contest.startAt || null;
    const countdown = useCountdown(startAt, clockOffset);
    const contestConnected = connection === 'online' && data?.connected === true;
    const seat = data?.team?.seat || runtime?.config.seat || '未设置';
    const seatStyle = {
        '--presentation-seat-fit': 1 / Math.max(Array.from(seat).length, 1),
    } as React.CSSProperties;
    const teamName = data?.team?.name || '等待服务器匹配队伍';
    const teamNameWidth = Array.from(teamName).reduce(
        (width, character) => width + ((character.codePointAt(0) || 0) > 0xff ? 1 : 0.58),
        0,
    );
    const teamStyle = {
        '--presentation-team-fit': 1 / Math.max(teamNameWidth, 1),
    } as React.CSSProperties;
    const schoolName = data?.team?.school || '请确认座位号和队伍数据';
    const ip = connection === 'online'
        ? data?.clientIp || runtime?.snapshot?.ip || 'IP unavailable'
        : runtime?.snapshot?.ip || data?.clientIp || 'IP unavailable';
    const contestName = data?.contest.name || 'XCPC Contest';
    const toolsConnectionLabel = connection === 'online'
        ? 'Server Connected'
        : connection === 'connecting' ? (data ? 'Reconnecting' : 'Connecting') : 'Server Offline';
    const ojConnection: ConnectionState = connection === 'online'
        ? data?.connected ? 'online' : 'offline'
        : 'connecting';
    const ojConnectionLabel = connection === 'online'
        ? data?.connected ? 'Connected' : 'Disconnected'
        : 'Unknown';

    if (!runtime && !error) {
        return (
            <Center mih="100dvh">
                <Stack align="center" gap="md">
                    <Loader />
                    <Text c="dimmed">正在读取本机展示配置</Text>
                </Stack>
            </Center>
        );
    }

    if (!runtime?.config.presentationUrl) {
        const emptySeat = runtime?.config.seat || '未设置';
        const emptyIp = runtime?.snapshot?.ip || 'IP unavailable';
        return (
            <main ref={rootRef} className="presentation-page presentation-empty">
                <ParticleBackground />
                <div className="presentation-empty-content">
                    <IconSchool size={66} stroke={1.35} aria-hidden="true" />
                    <h1>尚未配置展示信息</h1>
                    <p>请直接运行 <code>hydro-machine-tools</code>，从本地配置页保存服务器地址。</p>
                </div>
                <PresentationFooter
                    toolsConnection="offline"
                    ojConnection="offline"
                    ip={emptyIp}
                    onInfo={() => setInfoOpen(true)}
                />
                <DoNotTouchWarning visible={warningVisible} />
                <PresentationInfoModal
                    opened={infoOpen}
                    onClose={() => setInfoOpen(false)}
                    rows={[
                        { label: '座位号', value: emptySeat },
                        { label: '主机名', value: runtime?.snapshot?.hostname || 'Unavailable' },
                        { label: '当前 IP', value: emptyIp },
                        { label: '网络设备', value: runtime?.snapshot?.networks[0]?.dev || 'Unavailable' },
                        { label: '主服务器', value: 'Not configured' },
                        { label: 'Tools', value: 'Configuration Required', className: 'presentation-connection-offline' },
                        { label: 'OJ', value: 'Unknown', className: 'presentation-connection-offline' },
                        { label: 'Probe service', value: runtime?.probeServiceState || 'unknown' },
                        { label: 'Machine Tools', value: 'machine-tools/1.0' },
                    ]}
                />
            </main>
        );
    }

    return (
        <main ref={rootRef} className="presentation-page">
            <ParticleBackground />
            <header className="presentation-header">
                <div className="presentation-contest">
                    <h1>{contestName}</h1>
                </div>
                <div
                    className="presentation-countdown"
                    role="timer"
                    aria-label={contestConnected ? `距离比赛开始 ${countdown.clock}` : `当前时间 ${countdown.currentClock}`}
                >
                    <time>{contestConnected ? countdown.clock : countdown.currentClock}</time>
                </div>
            </header>

            <section className="presentation-stage" aria-label="参赛队伍信息">
                <div className="presentation-logo-frame">
                    {activeLogo && !logoFailed ? (
                        <img
                            key={`${activeLogo}:${logoRetry}`}
                            src={activeLogo}
                            alt={`${schoolName}校徽`}
                            className="presentation-school-logo"
                            onError={handleLogoError}
                        />
                    ) : (
                        <div className="presentation-logo-fallback" role="img" aria-label={`${schoolName}校徽暂不可用`}>
                            <IconSchool aria-hidden="true" />
                        </div>
                    )}
                </div>
                <div className="presentation-identity-card">
                    <div className="presentation-seat" style={seatStyle}>
                        <span className="visually-hidden">座位号</span>
                        <span className="presentation-seat-value">{seat}</span>
                    </div>
                    <div className="presentation-team-copy" style={teamStyle}>
                        <strong>{teamName}</strong>
                        <span>{schoolName}</span>
                    </div>
                </div>
            </section>

            <PresentationFooter
                toolsConnection={connection}
                ojConnection={ojConnection}
                ip={ip}
                onInfo={() => setInfoOpen(true)}
            />
            <DoNotTouchWarning visible={warningVisible} />
            <PresentationInfoModal
                opened={infoOpen}
                onClose={() => setInfoOpen(false)}
                rows={[
                    { label: '座位号', value: seat },
                    { label: '主机名', value: runtime?.snapshot?.hostname || 'Unavailable' },
                    { label: '当前 IP', value: ip },
                    { label: '网络设备', value: runtime?.snapshot?.networks[0]?.dev || 'Unavailable' },
                    { label: '主服务器', value: runtime?.config.serverUrl || runtime?.config.presentationUrl || 'Unavailable' },
                    { label: 'Tools', value: toolsConnectionLabel, className: `presentation-connection-${connection}` },
                    { label: 'OJ', value: ojConnectionLabel, className: `presentation-connection-${ojConnection}` },
                    { label: '展示数据', value: data ? 'Available' : 'Unavailable' },
                    { label: 'Probe service', value: runtime?.probeServiceState || 'unknown' },
                    { label: '时间偏差', value: `${clockOffset >= 0 ? '+' : ''}${(clockOffset / 1_000).toFixed(1)} s` },
                    { label: 'Machine Tools', value: 'machine-tools/1.0' },
                ]}
                error={error}
            />
        </main>
    );
}
