import type { Game } from '../types';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(value: string | null): string {
  if (!value) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateFmt.format(new Date(`${value}T00:00:00`));
}

export function formatPlaytime(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export const formatNumber = (n: number | null, suffix = '') => (n === null ? '—' : `${n}${suffix}`);

export function coverUrl(game: Game): string | null {
  if (!game.cover) return null;
  return `${import.meta.env.BASE_URL}covers/${encodeURIComponent(game.cover)}`;
}

/** Tags from the sheet with a friendlier display name. "<3" marks games my wife bought for me. */
export const genreLabel = (g: string) => (g === '<3' ? '♥ From my wife' : g);

/** Stable per-platform hue used for badges and placeholder covers. */
export function platformHue(platform: string): number {
  let h = 2166136261;
  for (const ch of platform) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // Golden-angle spread so near-identical names (PS2/PS3/PS4) land far apart.
  return Math.round(((h >>> 0) * 137.508) % 360);
}

export function ratingTier(rating: number | null): 'top' | 'great' | 'good' | 'meh' | 'none' {
  if (rating === null) return 'none';
  if (rating >= 90) return 'top';
  if (rating >= 80) return 'great';
  if (rating >= 70) return 'good';
  return 'meh';
}
