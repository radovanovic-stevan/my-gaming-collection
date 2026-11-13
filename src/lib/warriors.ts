import type { Game, WarriorsCatalogue, WarriorsEntry } from '../types';

/** Titles are matched the way the rest of the site matches them: letters and digits only. */
const key = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** One game in the catalogue, with the copies of it that are in the collection. */
export interface WarriorsGame {
  entry: WarriorsEntry;
  /** Owned copies, in the order they were added to the collection. */
  copies: Game[];
  /** Platforms a copy was found on that the catalogue doesn't list, so nothing owned is hidden. */
  extra: string[];
  /** Every owned copy is finished. */
  done: boolean;
}

export interface WarriorsSeries {
  id: string;
  name: string;
  kanji: string;
  note?: string;
  games: WarriorsGame[];
  owned: number;
  total: number;
}

export interface Warriors {
  series: WarriorsSeries[];
  /** Catalogue entries with at least one copy. */
  owned: number;
  total: number;
  /** Copies on the shelf, which is higher when a game is owned twice. */
  copies: number;
  /** Owned entries where every copy is finished. */
  done: number;
  /** Series with nothing missing. */
  complete: number;
}

/**
 * The catalogue with the collection folded into it. A copy belongs to the entry whose platforms list the one
 * it's on; when no entry does — a reissue, or a platform the catalogue is missing — it still counts, and the
 * platform is kept as an extra so an owned game is never shown as missing.
 */
export function buildWarriors(catalogue: WarriorsCatalogue, games: Game[]): Warriors {
  const index = new Map<string, WarriorsGame[]>();
  const series = catalogue.series.map((s) => {
    const list = s.games.map((entry) => {
      const game: WarriorsGame = { entry, copies: [], extra: [], done: false };
      for (const title of [entry.title, ...(entry.aliases ?? [])]) {
        const k = key(title);
        index.set(k, [...(index.get(k) ?? []), game]);
      }
      return game;
    });
    return { id: s.id, name: s.name, kanji: s.kanji, note: s.note, games: list, owned: 0, total: list.length };
  });

  for (const copy of games) {
    const candidates = index.get(key(copy.title));
    if (!candidates) continue;
    const onPlatform = candidates.filter((c) => c.entry.platforms.includes(copy.platform));
    const targets = onPlatform.length ? onPlatform : candidates;
    for (const target of targets) {
      target.copies.push(copy);
      if (!onPlatform.length && !target.extra.includes(copy.platform)) target.extra.push(copy.platform);
    }
  }

  for (const s of series) {
    for (const g of s.games) g.done = g.copies.length > 0 && g.copies.every((c) => c.status === 'Completed');
    s.owned = s.games.filter((g) => g.copies.length).length;
  }

  const all = series.flatMap((s) => s.games);
  return {
    series,
    owned: all.filter((g) => g.copies.length).length,
    total: all.length,
    copies: all.reduce((n, g) => n + g.copies.length, 0),
    done: all.filter((g) => g.done).length,
    complete: series.filter((s) => s.total && s.owned === s.total).length,
  };
}
