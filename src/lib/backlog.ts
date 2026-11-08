import type { Game, GotmMonth, PlayStatus, PlayedGame } from '../types';
import { monthPlayed } from './gotm';
import { dateKey } from './query';

/** A game still waiting, with the month it was last played in when the log happens to know one. */
export interface Waiting {
  game: Game;
  /** yyyy-mm of the last Game of the Month appearance, or null. */
  month: string | null;
  status: PlayStatus | null;
}

export interface Backlog {
  /** Rated but not finished: played, then set aside. Best rated first. */
  started: Waiting[];
  /** No rating: nothing says it was ever played. Longest owned first. */
  never: Waiting[];
  /** Owned but unplayable, longest owned first. */
  blocked: Waiting[];
}

const FAR = '9999-99-99';
const acquiredKey = (g: Game) => dateKey(g.acquired) ?? FAR;

/**
 * What's left to play. A rating is the test: giving a game a score means it was played, so a game marked Not
 * Completed with one was started and set aside, and one without was never started. The Game of the Month log
 * adds the month a game was last played, where it knows it, and keeps what's in progress this month out of
 * the backlog: it isn't waiting, it's being played.
 */
export function buildBacklog(games: Game[], months: GotmMonth[], link: (ref: PlayedGame) => Game | null, today: Date): Backlog {
  const last = new Map<number, { key: string; status: PlayStatus | null }>();
  for (const m of months) {
    monthPlayed(m.gameOfTheMonth, m.played).forEach((ref, i) => {
      const game = link(ref);
      if (!game) return;
      const key = `${m.month}#${String(i).padStart(3, '0')}`;
      if (key > (last.get(game.id)?.key ?? '')) last.set(game.id, { key, status: ref.status });
    });
  }

  const entry = (g: Game): Waiting => {
    const seen = last.get(g.id);
    return { game: g, month: seen ? seen.key.slice(0, 7) : null, status: seen?.status ?? null };
  };
  const byAcquired = (a: Waiting, b: Waiting) => acquiredKey(a.game).localeCompare(acquiredKey(b.game));
  const open = games.filter((g) => g.status === 'Not Completed').map(entry);
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const playingNow = (w: Waiting) => w.month === thisMonth && w.status === 'in-progress';

  return {
    started: open.filter((w) => w.game.rating !== null).sort((a, b) => b.game.rating! - a.game.rating! || byAcquired(a, b)),
    never: open.filter((w) => w.game.rating === null && !playingNow(w)).sort(byAcquired),
    blocked: games
      .filter((g) => g.status === 'Unplayable')
      .map(entry)
      .sort(byAcquired),
  };
}

/** Whole years between a game's acquired date and today, or null when the date says nothing. */
export function yearsOwned(game: Game, today: Date): number | null {
  const key = acquiredKey(game);
  if (key === FAR) return null;
  const years = (today.getTime() - new Date(`${key}T00:00:00`).getTime()) / (365.25 * 24 * 3600 * 1000);
  return years < 0 ? 0 : Math.floor(years);
}
