export const STATUSES = ['Completed', 'Not Completed', 'Null', 'Unplayable', 'Unrateable'] as const;
export type Status = (typeof STATUSES)[number];

export interface Game {
  id: number;
  title: string;
  platform: string;
  /** ISO date (yyyy-mm-dd) or free text such as "Late 2013 - Early 2014". */
  acquired: string | null;
  /** ISO date, free text ("Not Registered"), or null. */
  completed: string | null;
  status: Status;
  rating: number | null;
  timesCompleted: number | null;
  percent: number | null;
  /** Minutes played. */
  playtime: number | null;
  genres: string[];
  condition: string[];
  edition: string;
  /** File names inside public/images. */
  images: string[];
  /** The image shown as the game's cover; always one of `images`. */
  cover: string | null;
}

export type SortKey =
  | 'title'
  | 'platform'
  | 'rating'
  | 'status'
  | 'acquired'
  | 'completed'
  | 'playtime'
  | 'timesCompleted'
  | 'percent'
  | 'id';

export interface SortLevel {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export type View = 'grid' | 'table';

export interface Query {
  search: string;
  platforms: string[];
  statuses: string[];
  genres: string[];
  conditions: string[];
  acquiredYears: string[];
  completedYears: string[];
  ratingMin: number | null;
  ratingMax: number | null;
  cover: 'any' | 'with' | 'without';
  sort: SortLevel[];
  view: View;
}

// --- Game of the Month / Game of the Category (imported from the sheets) ----

export type PlayStatus = 'completed' | 'in-progress' | 'played' | 'post-completion';

/** A game as the award sheets name it; linked to the collection by title + platform. */
export interface GameRef {
  title: string;
  platform: string;
}

export interface PlayedGame extends GameRef {
  status: PlayStatus | null;
}

export interface GotmMonth {
  /** yyyy-mm */
  month: string;
  gameOfTheMonth: PlayedGame | null;
  /** Games completed that month, including the Game of the Month. */
  completed: number | null;
  bought: number | null;
  /** Other games played that month (the Game of the Month is not repeated here). */
  played: PlayedGame[];
}

/** A category winner: a game, or free text for awards like "Console of the Year". */
export type AwardValue = GameRef | { text: string };

export interface GotcYear {
  year: number;
  awards: { category: string; winner: AwardValue | null }[];
  stats: {
    gamesCompleted?: number;
    gamesBought?: number;
    consolesBought?: string[];
    multipleGotmWinners?: GameRef[];
    honorableMentions?: string;
    ratingChanges?: { title: string; from: number; to: number }[];
  };
}

export interface GotcData {
  about: string;
  allTime: { category: string; ranking: AwardValue[] }[];
  years: GotcYear[];
}
