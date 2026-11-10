import type { Game } from '../types';
import { acquiredSortKey } from './format';

export interface Stamp {
  country: string;
  games: number;
  /** The first game bought there: its raw `acquired` value, free text and all. */
  first: string | null;
  /** That game's sortable key, which is what the stamps are ordered by. */
  key: string;
}

/**
 * A stamp per country, in the order the countries first turned up in the collection.
 *
 * The map already says where and how many; the passport says when each one was first opened, which is the
 * one thing the map can't draw. The earliest buy can be a vague date ("Before 2012"), so the stamp carries
 * the written value rather than a date it can't stand behind.
 */
export function buildPassport(games: Game[]): Stamp[] {
  const byCountry = new Map<string, Game[]>();
  for (const g of games) {
    if (g.boughtIn) byCountry.set(g.boughtIn, [...(byCountry.get(g.boughtIn) ?? []), g]);
  }

  return [...byCountry]
    .map(([country, gs]) => {
      const earliest = gs
        .map((g) => ({ raw: g.acquired, key: acquiredSortKey(g.acquired) }))
        .filter((d) => d.key)
        .sort((a, b) => a.key.localeCompare(b.key))[0];
      return { country, games: gs.length, first: earliest?.raw ?? null, key: earliest?.key ?? '' };
    })
    // Two countries can share a vague first date ("Before 2012"); the bigger one led the way.
    .sort((a, b) => a.key.localeCompare(b.key) || b.games - a.games || a.country.localeCompare(b.country));
}

const INKS = 4;
const SHAPES = ['round', 'rect', 'oval'] as const;

/** A stable number per country, so a stamp looks the same on every visit. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The look of one stamp: which ink, which shape, and how crooked it was pressed. */
export function stampStyle(country: string) {
  const h = hash(country);
  // A long name never gets a circle; it wouldn't fit inside one.
  const shape = country.length > 10 ? 'rect' : SHAPES[h % SHAPES.length];
  return { ink: h % INKS, shape, angle: ((h >>> 8) % 15) - 7 };
}
