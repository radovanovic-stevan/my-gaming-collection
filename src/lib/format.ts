import type { Game } from '../types';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(value: string | null): string {
  if (!value) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateFmt.format(new Date(`${value}T00:00:00`));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SEASONS: Record<string, string> = { spring: '04', summer: '07', autumn: '10', fall: '10', winter: '12' };

/**
 * A sortable yyyy-mm-dd for an acquired value, also from free text like "October 2015", "Summer of 2018"
 * or "Slim in 2009, Fat in 2023" (the latest one counts). Unknown months sort as the start of the year; '' when there's no year.
 */
export function acquiredSortKey(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const keys = value.split(/,|\band\b/i).map((part) => {
    const year = part.match(/\b(\d{4})\b/)?.[1];
    if (!year) return '';
    const word = part.toLowerCase().match(/[a-z]+/g) ?? [];
    const month = word.map((w) => MONTHS.indexOf(w.slice(0, 3))).find((i) => i >= 0);
    const season = word.map((w) => SEASONS[w]).find(Boolean);
    return `${year}-${month !== undefined ? String(month + 1).padStart(2, '0') : (season ?? '00')}-00`;
  });
  return keys.reduce((a, b) => (a > b ? a : b), '');
}

export function formatPlaytime(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "2024-08" as "August 2024". */
export const formatMonthYear = (yyyyMm: string) => monthFmt.format(new Date(`${yyyyMm}-01T00:00:00`));

export const formatNumber = (n: number | null, suffix = '') => (n === null ? '—' : `${n}${suffix}`);

export const imageUrl = (file: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(file)}`;

export const coverUrl = (game: Game): string | null => (game.cover ? imageUrl(game.cover) : null);

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
