import type { Game, GameRef } from '../types';

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13 };

/** Sequel numbers in a title ("Adventure II" and "Adventure 2" both give "2"). */
const numerals = (title: string) =>
  (title.toLowerCase().match(/\b(\d+|[ivx]+)\b/g) ?? [])
    .map((n) => (n in ROMAN ? ROMAN[n] : Number(n)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .join(',');

/** Edit distance, capped: returns max+1 as soon as it's clearly further apart. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Builds a lookup from the award sheets' "Title [Platform]" names to collection games.
 * The sheets are hand-typed, so after exact matches it tolerates small typos
 * ("Metal Geaer Solid"), longer edition names ("Heavy Rain: Move Edition") and
 * "Moment - Game" award entries, always within the same platform and with the
 * same sequel numbers.
 */
export function createLinker(games: Game[]) {
  const byKey = new Map<string, Game>();
  const byTitle = new Map<string, Game[]>();
  const byPlatform = new Map<string, { key: string; nums: string; game: Game }[]>();
  for (const g of games) {
    const t = norm(g.title);
    byKey.set(`${t}|${g.platform}`, g);
    byTitle.set(t, [...(byTitle.get(t) ?? []), g]);
    byPlatform.set(g.platform, [...(byPlatform.get(g.platform) ?? []), { key: t, nums: numerals(g.title), game: g }]);
  }

  const exact = (title: string, platform: string) => byKey.get(`${norm(title)}|${platform}`);

  function fuzzy(title: string, platform: string): Game | undefined {
    const t = norm(title);
    if (t.length < 6) return undefined;
    const nums = numerals(title);
    let best: { game: Game; score: number } | undefined;
    for (const { key, nums: candidateNums, game } of byPlatform.get(platform) ?? []) {
      // Never cross a sequel boundary: "Adventure 2" is not "Adventure".
      if (candidateNums !== nums) continue;
      // Edition suffixes: the sheet name extends the collection title.
      const score = key.length >= 6 && t.startsWith(key) ? 0.5 : distance(t, key, 2);
      if (score <= 2 && (!best || score < best.score)) best = { game, score };
    }
    return best?.game;
  }

  const cache = new Map<string, Game | null>();
  return (ref: GameRef | null | undefined): Game | null => {
    if (!ref || !('title' in ref)) return null;
    const cacheKey = `${ref.title}|${ref.platform}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const sameTitle = byTitle.get(norm(ref.title)) ?? [];
    const parts = ref.title.split(/\s+-\s+/);
    const found =
      exact(ref.title, ref.platform) ??
      (sameTitle.length === 1 ? sameTitle[0] : undefined) ??
      (parts.length > 1 ? parts.map((p) => exact(p, ref.platform)).find(Boolean) : undefined) ??
      fuzzy(ref.title, ref.platform) ??
      (parts.length > 1 ? parts.map((p) => fuzzy(p, ref.platform)).find(Boolean) : undefined) ??
      null;
    cache.set(cacheKey, found);
    return found;
  };
}

export const isGameRef = (v: unknown): v is GameRef => typeof v === 'object' && v !== null && 'title' in v;
