import { queryOptions } from '@tanstack/react-query';

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

export const metricsQuery = () => queryOptions({
  queryKey: ['metrics'],
  queryFn: ({ signal }) => fetchJson<any[]>('/metrics', signal),
  staleTime: 15_000,
});

export const overviewQuery = () => queryOptions({
  queryKey: ['overview'],
  queryFn: ({ signal }) => fetchJson<any>('/overview', signal),
  staleTime: 15_000,
});

export const presentationTeamsQuery = () => queryOptions({
  queryKey: ['presentation-teams'],
  queryFn: ({ signal }) => fetchJson<any>('/presentation-teams', signal),
  staleTime: 5_000,
});

export const printQuery = () => queryOptions({
  queryKey: ['tasks'],
  queryFn: ({ signal }) => fetchJson<any>('/print', signal),
  staleTime: 5_000,
});

export const balloonQuery = () => queryOptions({
  queryKey: ['balloons'],
  queryFn: ({ signal }) => fetchJson<any>('/balloon', signal),
  staleTime: 30_000,
});

export const monitorQuery = () => queryOptions({
  queryKey: ['monitor'],
  queryFn: ({ signal }) => fetchJson<any>('/monitor', signal),
  staleTime: 10_000,
});

export const commandsQuery = () => queryOptions({
  queryKey: ['commands'],
  queryFn: ({ signal }) => fetchJson<any>('/commands', signal),
  staleTime: 5_000,
});

export const queriesForPath = (path: string) => {
  switch (path) {
    case '/': return [overviewQuery(), metricsQuery()];
    case '/presentation-teams': return [presentationTeamsQuery()];
    case '/print': return [printQuery()];
    case '/balloon': return [balloonQuery()];
    case '/monitor': return [monitorQuery()];
    case '/commands': return [commandsQuery()];
    default: return [];
  }
};
