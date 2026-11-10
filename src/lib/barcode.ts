import type { Game } from '../types';
import { acquiredSortKey, platformHue } from './format';

/**
 * One stripe per game, in the order the games came home: the whole collection as a barcode.
 *
 * Platforms are told apart by `platformHue`, not by the shelf bands: half the bands are the same black
 * (PS1, PS3, PSP) or the same white (DS, Wii, 3DS), which reads as one big smudge at a pixel per game.
 */
export const stripeColour = (platform: string, lightness = 52) => `hsl(${platformHue(platform)} 62% ${lightness}%)`;

export interface Stripe {
  game: Game;
  /** The sortable yyyy-mm-dd behind `acquired`, free text and all. */
  key: string;
  year: string;
}

/** The first stripe of a year, for the axis under the barcode. */
export interface YearMark {
  year: string;
  index: number;
}

export interface Barcode {
  stripes: Stripe[];
  years: YearMark[];
  /** Platforms for the legend, biggest first. */
  platforms: { platform: string; count: number }[];
  first: string;
  last: string;
  /** Games with no year at all anywhere in `acquired`; they get no stripe. */
  undated: number;
}

export function buildBarcode(games: Game[]): Barcode {
  const stripes: Stripe[] = games
    .map((game) => ({ game, key: acquiredSortKey(game.acquired) }))
    .filter((s) => s.key)
    // Within a day, and within the vaguer keys like "Before 2012", the id keeps the order they were entered in.
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.game.id - b.game.id))
    .map((s) => ({ ...s, year: s.key.slice(0, 4) }));

  const years: YearMark[] = [];
  stripes.forEach((s, index) => {
    if (s.year !== years[years.length - 1]?.year) years.push({ year: s.year, index });
  });

  const counts = new Map<string, number>();
  for (const s of stripes) counts.set(s.game.platform, (counts.get(s.game.platform) ?? 0) + 1);
  const platforms = [...counts]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));

  return {
    stripes,
    years,
    platforms,
    first: years[0]?.year ?? '',
    last: years[years.length - 1]?.year ?? '',
    undated: games.length - stripes.length,
  };
}
