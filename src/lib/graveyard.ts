import type { Game, GameRef, GotmMonth, PlayedGame } from '../types';
import { monthPlayed } from './gotm';

/** How long a platform has gone untouched. */
export type Tier = 'warm' | 'cold' | 'dead' | 'never';

export interface Plot {
  platform: string;
  /** Games in the collection on this platform. */
  games: number;
  /** When it was last played (yyyy-mm-dd), or null when nothing says it ever was. */
  date: string | null;
  /** The last game played on it, for the epitaph. */
  title: string | null;
  /** Whole days since, or null with no record. */
  days: number | null;
  tier: Tier;
}

const DAY = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The last day of a yyyy-mm. A month in the log only says "that month", so it counts as played at its end. */
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return iso(new Date(y, m, 0));
};

const tierOf = (days: number | null): Tier => (days === null ? 'never' : days <= 90 ? 'warm' : days <= 365 ? 'cold' : 'dead');

/**
 * Every platform in the collection and how long since anything on it was played.
 *
 * Play is what the site already counts as play: the Game of the Month log, which is monthly, plus completion
 * dates, which are exact. A month counts at its end, capped at today, so playing something this month reads as
 * nought days rather than as the future.
 */
export function buildGraveyard(games: Game[], months: GotmMonth[], link: (ref: GameRef) => Game | null, today: Date): Plot[] {
  const todayIso = iso(today);
  const last = new Map<string, { date: string; title: string }>();
  const bury = (platform: string | undefined, date: string, title: string) => {
    if (!platform || date < '1900-01-01') return;
    const at = date > todayIso ? todayIso : date;
    const seen = last.get(platform);
    if (!seen || at >= seen.date) last.set(platform, { date: at, title });
  };

  for (const m of months) {
    for (const ref of monthPlayed<PlayedGame>(m.gameOfTheMonth, m.played)) {
      // The log names its own platform; the collection's spelling wins when the game still links.
      bury(link(ref)?.platform ?? ref.platform, monthEnd(m.month), ref.title);
    }
  }
  for (const g of games) {
    if (g.completed && /^\d{4}-\d{2}-\d{2}$/.test(g.completed)) bury(g.platform, g.completed, g.title);
  }

  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1);

  return [...counts]
    .map(([platform, games]) => {
      const seen = last.get(platform) ?? null;
      const days = seen ? Math.max(0, Math.floor((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${seen.date}T00:00:00`).getTime()) / DAY)) : null;
      return { platform, games, date: seen?.date ?? null, title: seen?.title ?? null, days, tier: tierOf(days) };
    })
    // The longest dead first; platforms with no record at all lead the whole yard.
    .sort((a, b) => {
      const da = a.days ?? Infinity;
      const db = b.days ?? Infinity;
      if (da !== db) return db - da;
      return b.games - a.games || a.platform.localeCompare(b.platform);
    });
}
