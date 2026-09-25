import type { Game } from '../types';

export type GameInput = Omit<Game, 'id' | 'cover'>;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data as T;
}

/** The editing API only exists on the local dev server. */
export async function detectEditing(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    return (await fetch('/api/health')).ok;
  } catch {
    return false;
  }
}

export const api = {
  create: (game: GameInput) => request<Game>('POST', 'games', game),
  update: (id: number, game: GameInput) => request<Game>('PUT', `games/${id}`, game),
  remove: (id: number) => request<{ ok: true }>('DELETE', `games/${id}`),
  setCover: (id: number, dataUrl: string) => request<Game>('PUT', `games/${id}/cover`, { dataUrl }),
  removeCover: (id: number) => request<Game>('DELETE', `games/${id}/cover`),
  fetchImage: async (url: string): Promise<Blob> => {
    const r = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.blob();
  },
};
