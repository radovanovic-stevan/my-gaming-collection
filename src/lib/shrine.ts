import type { Game, ShrineCatalogue, ShrineEntry } from '../types';

/** Titles are matched the way the rest of the site matches them: letters and digits only. */
const key = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** One game in a catalogue, with the copies of it that are in the collection. */
export interface ShrineGame {
  entry: ShrineEntry;
  /** Owned copies, in the order they were added to the collection. */
  copies: Game[];
  /** Platforms a copy was found on that the catalogue doesn't list, so nothing owned is hidden. */
  extra: string[];
  /** At least one owned copy is finished. */
  done: boolean;
}

export interface ShrineSeries {
  id: string;
  name: string;
  kanji?: string;
  note?: string;
  games: ShrineGame[];
  owned: number;
  total: number;
}

export interface Shrine {
  series: ShrineSeries[];
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
export function buildShrine(catalogue: ShrineCatalogue, games: Game[]): Shrine {
  const index = new Map<string, ShrineGame[]>();
  const series = catalogue.series.map((s) => {
    const list = s.games.map((entry) => {
      const game: ShrineGame = { entry, copies: [], extra: [], done: false };
      // A Set, because an alias that only differs in punctuation is the same key as the title.
      for (const k of new Set([entry.title, ...(entry.aliases ?? [])].map(key))) {
        index.set(k, [...(index.get(k) ?? []), game]);
      }
      return game;
    });
    // Oldest first, whatever order the catalogue lists them in, so a series reads as its own timeline.
    list.sort((a, b) => a.entry.year - b.entry.year);
    return { id: s.id, name: s.name, kanji: s.kanji, note: s.note, games: list, owned: 0, total: list.length };
  });

  for (const copy of games) {
    const candidates = index.get(key(copy.title));
    if (!candidates) continue;
    const onPlatform = candidates.filter((c) => c.entry.platforms.includes(copy.platform));
    const targets = onPlatform.length ? onPlatform : candidates;
    for (const target of targets) {
      if (target.copies.includes(copy)) continue;
      target.copies.push(copy);
      if (!onPlatform.length && !target.extra.includes(copy.platform)) target.extra.push(copy.platform);
    }
  }

  for (const s of series) {
    for (const g of s.games) {
      // Owning a game twice and finishing it once means it's finished: the copy that was played leads.
      g.copies.sort((a, b) => Number(b.status === 'Completed') - Number(a.status === 'Completed'));
      g.done = g.copies.some((c) => c.status === 'Completed');
    }
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
