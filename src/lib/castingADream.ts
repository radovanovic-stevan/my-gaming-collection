import type { CastingADream, Game, LauncherGame } from '../types';
import { DEFAULT_QUERY, applyQuery } from './query';
import { createLinker } from './links';

/**
 * Finds each launcher game in the collection: by the same search the launcher's collection link uses
 * (it must find exactly one game on that platform), falling back to the title matching used for the award sheets.
 */
export function matchLauncherGames(data: CastingADream, games: Game[]): Map<LauncherGame, Game> {
  const link = createLinker(games);
  const out = new Map<LauncherGame, Game>();
  for (const lg of data.games) {
    const found = applyQuery(games, { ...DEFAULT_QUERY, search: lg.search, platforms: [lg.platform] });
    const game = found.length === 1 ? found[0] : link({ title: lg.title, platform: lg.platform });
    if (game) out.set(lg, game);
  }
  return out;
}

/** The collection with play time from the launcher, which replaces the recorded one for the games it plays. */
export function withLauncherPlaytime(games: Game[], data: CastingADream | null): Game[] {
  if (!data) return games;
  const minutes = new Map<number, number>();
  for (const [lg, game] of matchLauncherGames(data, games)) if (lg.minutes !== undefined) minutes.set(game.id, lg.minutes);
  if (!minutes.size) return games;
  return games.map((g) => (minutes.has(g.id) ? { ...g, playtime: minutes.get(g.id)! } : g));
}

export const earnedCount = (lg: LauncherGame) => lg.trophies?.filter((t) => t.unlocked).length ?? 0;
