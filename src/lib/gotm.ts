import type { GameRef } from '../types';

/** Two entries point at the same copy. Months are written from the collection, so the names match exactly. */
export const sameRef = (a: GameRef, b: GameRef | null | undefined) => !!b && a.title === b.title && a.platform === b.platform;

/**
 * A month's games in the order they were played, the Game of the Month among them exactly once.
 * From October 2026 the month lists it in `played` too, at the point it was actually played; before that it was
 * left out of the list, so it counts as played first.
 */
export function monthPlayed<T extends GameRef>(gotm: T | null | undefined, played: T[]): T[] {
  if (!gotm) return played;
  return played.some((p) => sameRef(p, gotm)) ? played : [gotm, ...played];
}
