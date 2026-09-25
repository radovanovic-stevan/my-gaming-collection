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
  note: string;
  genres: string[];
  condition: string[];
  edition: string;
  /** File name inside public/covers. */
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
