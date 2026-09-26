import type { Game } from '../types';

export interface AllTimeRanking {
  category: string;
  group: 'Overall' | 'By year' | 'Platforms' | 'Genres';
  ranking: Game[];
}

const SIZE = 5;

// Category names as the sheet had them; platforms and genres not listed here get a
// default name and are shown after these, alphabetically.
const PLATFORM_NAMES: [string, string][] = [
  ['PS1', 'PS1 Games'],
  ['PS Classic', 'PS Classic Games'],
  ['PS2', 'PS2 Games'],
  ['PS3', 'PS3 Games'],
  ['PS4', 'PS4 Games'],
  ['Wii', 'Wii Games'],
  ['3DS', '3DS Games'],
  ['NDS', 'DS Games'],
  ['GCN', 'GCN Games'],
  ['SNES Classic', 'SNES Classic Games'],
  ['PSP', 'PSP Games'],
  ['VITA', 'VITA Games'],
  ['Atari FB3', 'Atari FB Games'],
  ['PC', 'PC Games'],
];
const GENRE_NAMES: [string, string][] = [
  ['FPS', 'FPS Games'],
  ['TPS', 'TPS Games'],
  ['Horror', 'Horror Games'],
  ['Racing', 'Racing Games'],
  ['Fighting', 'Fighting Games'],
  ['RPG', 'RPGs'],
  ['Platformer', 'Platformers'],
  ['Action', 'Action Games'],
  ['Adventure', 'Adventure Games'],
  ['Stealth', 'Stealth Games'],
  ['H&S', 'Hack&Slash Games'],
  ['Puzzle', 'Puzzle Games'],
  ['Strategy', 'Strategy Games'],
  ['Sports', 'Sports Games'],
  ['Party', 'Party Games'],
  ['OpenWorld', 'Open World Games'],
];
/** Tags that aren't genres: "<3" has its own "Games from Slavica" ranking. */
const NOT_GENRES = new Set(['<3', 'L']);

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** The year a game was acquired, also from free text like "Day 1 2012" (but not "Before 2012"). */
function acquiredYear(g: Game): string | null {
  if (isoDate(g.acquired)) return g.acquired!.slice(0, 4);
  const years = g.acquired?.match(/\b\d{4}\b/g) ?? [];
  return years.length === 1 && !/before/i.test(g.acquired!) ? years[0] : null;
}

const completedYear = (g: Game) => isoDate(g.completed).slice(0, 4) || null;

/** Highest rating first; on a tie the most recently completed game wins. */
function byRank(a: Game, b: Game): number {
  return b.rating! - a.rating! || isoDate(b.completed).localeCompare(isoDate(a.completed)) || a.title.localeCompare(b.title);
}

/** Orders keys by a list of known names first, then the rest alphabetically. */
function ordered(keys: Iterable<string>, known: [string, string][], fallback: (k: string) => string): [string, string][] {
  const seen = new Set(keys);
  const rest = [...seen].filter((k) => !known.some(([n]) => n === k)).sort((a, b) => a.localeCompare(b));
  return [...known.filter(([k]) => seen.has(k)), ...rest.map((k): [string, string] => [k, fallback(k)])];
}

/** Builds the all-time top-5 lists from the collection's ratings. */
export function buildAllTime(games: Game[]): AllTimeRanking[] {
  const rated = games.filter((g) => g.rating !== null).sort(byRank);
  const out: AllTimeRanking[] = [];
  const add = (group: AllTimeRanking['group'], category: string, test: (g: Game) => boolean) => {
    const ranking = rated.filter(test).slice(0, SIZE);
    if (ranking.length) out.push({ category, group, ranking });
  };

  add('Overall', 'All-Time List', () => true);
  add('Overall', 'Games from Slavica', (g) => g.genres.includes('<3'));

  const years = new Set(rated.flatMap((g) => [acquiredYear(g), completedYear(g)]).filter((y): y is string => y !== null));
  for (const year of [...years].sort().reverse()) {
    add('By year', `Games Acquired ${year}`, (g) => acquiredYear(g) === year);
    add('By year', `Games Completed ${year}`, (g) => completedYear(g) === year);
  }

  for (const [platform, name] of ordered(rated.map((g) => g.platform), PLATFORM_NAMES, (p) => `${p} Games`))
    add('Platforms', name, (g) => g.platform === platform);

  const genres = rated.flatMap((g) => g.genres).filter((t) => !NOT_GENRES.has(t));
  for (const [genre, name] of ordered(genres, GENRE_NAMES, (t) => `${t} Games`)) add('Genres', name, (g) => g.genres.includes(genre));

  return out;
}
