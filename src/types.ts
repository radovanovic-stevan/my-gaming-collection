export const STATUSES = ['Completed', 'Not Completed', 'Null', 'Unplayable', 'Unrateable'] as const;
export type Status = (typeof STATUSES)[number];

/** Anything with pictures: a list of files in public/images, one of them the cover. */
export interface WithImages {
  id: number;
  images: string[];
  cover: string | null;
}

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
  /** Link to this game's trophy list on PSNProfiles, for games with trophies. */
  trophies?: string | null;
  /** Country the copy was bought in (or, for a gift, where the giver got it). Named as on the world map. */
  boughtIn?: string | null;
  /** How the game is played when the original copy can't be, e.g. "Emulator" or "Modded PS2"; null when it isn't needed. */
  playsVia?: string | null;
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
  playsVia: string[];
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
    honorableMentions?: string[];
    ratingChanges?: { title: string; from: number; to: number }[];
  };
}

export interface GotcData {
  about: string;
  years: GotcYear[];
}

// --- Gallery -----------------------------------------------------------------

export interface GalleryEntry {
  id: number;
  /** File name inside public/images. */
  image: string;
  /** When the picture was taken (yyyy-mm-dd), if known. */
  date: string | null;
  description: string;
  /** Games shown in the picture; linked to the collection by title + platform. */
  games: GameRef[];
}

/** A non-game collection (e.g. comics), kept as a checklist per series. */
export interface ChecklistItem {
  /** An issue number, or a title for series without numbers. */
  label: string;
  owned: boolean;
}

export interface ChecklistSeries {
  id: number;
  name: string;
  /** "numbers" shows a grid of issue numbers; "titles" a list of named books. */
  kind: 'numbers' | 'titles';
  items: ChecklistItem[];
}

export interface ChecklistCollection {
  title: string;
  series: ChecklistSeries[];
}

// --- Vinyl ---------------------------------------------------------------------

/** One play of one side of a record. */
export interface VinylListen {
  /** The side as it's labelled on the record: 1, 2, A, B, … */
  side: string;
  /** yyyy-mm-dd, or null when it isn't known yet. */
  date: string | null;
}

export interface Vinyl extends WithImages {
  artist: string;
  title: string;
  /** yyyy-mm-dd, or null when it isn't known. */
  acquired: string | null;
  /** Oldest first. */
  listens: VinylListen[];
}

// --- Consoles ------------------------------------------------------------------------

/** One model of a console that's owned, e.g. PS2 Slim (Silver). */
export interface ConsoleModel {
  name: string;
  /** Its picture; one of the console's `images`, or null. */
  image: string | null;
}

export interface GameConsole extends WithImages {
  name: string;
  maker: string;
  /** The platform its games are filed under in the collection (e.g. PS2). */
  platform: string | null;
  /** ISO date (yyyy-mm-dd) or free text, like a game's `acquired`. */
  acquired: string | null;
  notes: string;
  /** The models owned, when it's worth naming them; empty otherwise. */
  models: ConsoleModel[];
}

// --- Blog ---------------------------------------------------------------------------

export interface BlogPost {
  id: number;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
  /** File name inside public/images, or null. */
  cover: string | null;
  /** A draft is only shown while editing locally, not on the published site. */
  draft?: boolean;
}
