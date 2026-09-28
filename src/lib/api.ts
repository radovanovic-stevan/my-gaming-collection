import type { ChecklistSeries, Game, GalleryEntry, GotcYear, GotmMonth } from '../types';

export type GameInput = Omit<Game, 'id' | 'images' | 'cover'>;
/** A new picture needs a dataUrl; when editing, one replaces the picture. */
export type SeriesInput = Omit<ChecklistSeries, 'id'> & { position?: number };
export type GalleryInput = Omit<GalleryEntry, 'id' | 'image'> & { dataUrl?: string };

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
  addImage: (id: number, dataUrl: string) => request<Game>('POST', `games/${id}/images`, { dataUrl }),
  removeImage: (id: number, file: string) => request<Game>('DELETE', `games/${id}/images/${encodeURIComponent(file)}`),
  setCover: (id: number, file: string) => request<Game>('PUT', `games/${id}/cover`, { file }),
  saveMonth: (key: string, month: GotmMonth) => request<GotmMonth>('PUT', `gotm/${key}`, month),
  deleteMonth: (key: string) => request<{ ok: true }>('DELETE', `gotm/${key}`),
  saveYear: (key: number, year: GotcYear) => request<GotcYear>('PUT', `gotc/years/${key}`, year),
  deleteYear: (key: number) => request<{ ok: true }>('DELETE', `gotc/years/${key}`),
  addPicture: (entry: GalleryInput) => request<GalleryEntry>('POST', 'gallery', entry),
  updatePicture: (id: number, entry: GalleryInput) => request<GalleryEntry>('PUT', `gallery/${id}`, entry),
  deletePicture: (id: number) => request<{ ok: true }>('DELETE', `gallery/${id}`),
  addSeries: (collection: string, series: SeriesInput) => request<ChecklistSeries>('POST', `collections/${collection}/series`, series),
  updateSeries: (collection: string, id: number, series: SeriesInput) => request<ChecklistSeries>('PUT', `collections/${collection}/series/${id}`, series),
  deleteSeries: (collection: string, id: number) => request<{ ok: true }>('DELETE', `collections/${collection}/series/${id}`),
  fetchImage: async (url: string): Promise<Blob> => {
    const r = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.blob();
  },
};
