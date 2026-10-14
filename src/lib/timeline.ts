import type { BlogPost, CastingADream, Game, GalleryEntry, GameRef, GotcData, GotmMonth } from '../types';
import { acquiredSortKey } from './format';
import { matchLauncherGames } from './castingADream';

export type EventKind = 'acquired' | 'completed' | 'gotm' | 'goty' | 'trophy' | 'photo' | 'blog';

export const EVENT_LABELS: Record<EventKind, string> = {
  acquired: 'Acquired',
  completed: 'Completed',
  gotm: 'Game of the Month',
  goty: 'Game of the Year',
  trophy: 'Casting a Dream Trophy',
  photo: 'Photo',
  blog: 'Blog post',
};

/** A game an event is about: the collection game when it's found, else the name as it was written. */
export interface EventGame {
  ref: GameRef;
  game: Game | null;
}

export interface TimelineEvent {
  kind: EventKind;
  /**
   * Sorts newest first and places the event: yyyy-mm-dd for a day, yyyy-mm-00 for a month without a day
   * (yyyy-mm-99 for Game of the Month, so it heads its month), yyyy-00 for a year without a month
   * (yyyy-99 for Game of the Year, so it heads its year), and 0000 for "Before 2012".
   */
  key: string;
  /** Only for day-dated events: yyyy-mm-dd. */
  day: string | null;
  /** The date as written, for an acquired date that isn't a single day ("Late 2013 - Early 2014"). */
  when?: string;
  games: EventGame[];
  /** Launcher trophies unlocked that day, for a trophy event. */
  trophies?: string[];
  photo?: GalleryEntry;
  post?: BlogPost;
}

/** Everything the timeline is built from. */
export interface TimelineSources {
  games: Game[];
  months: GotmMonth[];
  awards: GotcData;
  gallery: GalleryEntry[];
  blog: BlogPost[];
  launcher: CastingADream | null;
  link: (ref: GameRef) => Game | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BEFORE = /^before\b/i;

/** Where an acquired date sits on the timeline, also for free text like "Late 2013 - Early 2014". */
function acquiredKey(value: string | null): string | null {
  if (!value) return null;
  if (ISO.test(value)) return value;
  if (BEFORE.test(value)) return '0000';
  const key = acquiredSortKey(value);
  if (!key) return null;
  return key.slice(5, 7) === '00' ? key.slice(0, 7) : key; // yyyy-00 or yyyy-mm-00
}

/**
 * Every game event, newest first. Games acquired or completed on the same day share one event,
 * and so do a game's trophies unlocked on the same day. Draft blog posts are left out.
 */
export function buildTimeline({ games, months, awards, gallery, blog, launcher, link }: TimelineSources): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const grouped = new Map<string, TimelineEvent>();
  const add = (kind: EventKind, key: string, game: Game, when?: string) => {
    const id = `${kind}|${key}|${when ?? ''}`;
    const existing = grouped.get(id);
    const entry = { ref: { title: game.title, platform: game.platform }, game };
    if (existing) return existing.games.push(entry);
    const event: TimelineEvent = { kind, key, day: ISO.test(key) ? key : null, when, games: [entry] };
    grouped.set(id, event);
    events.push(event);
  };

  for (const g of games) {
    const acquired = acquiredKey(g.acquired);
    if (acquired) add('acquired', acquired, g, ISO.test(acquired) ? undefined : g.acquired!);
    if (g.completed && ISO.test(g.completed)) add('completed', g.completed, g);
  }

  if (launcher) {
    const matched = matchLauncherGames(launcher, games);
    for (const lg of launcher.games) {
      const game = matched.get(lg) ?? null;
      const byDay = new Map<string, string[]>();
      for (const t of lg.trophies ?? []) {
        if (t.unlocked && ISO.test(t.unlocked)) byDay.set(t.unlocked, [...(byDay.get(t.unlocked) ?? []), t.title ?? 'Secret trophy']);
      }
      for (const [day, trophies] of byDay) events.push({ kind: 'trophy', key: day, day, games: [{ ref: { title: game?.title ?? lg.title, platform: lg.platform }, game }], trophies });
    }
  }

  for (const post of blog) {
    if (!post.draft && ISO.test(post.date)) events.push({ kind: 'blog', key: post.date, day: post.date, games: [], post });
  }

  for (const m of months) {
    if (m.gameOfTheMonth) events.push({ kind: 'gotm', key: `${m.month}-99`, day: null, games: [{ ref: m.gameOfTheMonth, game: link(m.gameOfTheMonth) }] });
  }

  for (const y of awards.years) {
    const winner = y.awards.find((a) => a.category === 'Game of the Year Winner')?.winner;
    if (winner && 'title' in winner) events.push({ kind: 'goty', key: `${y.year}-99`, day: null, games: [{ ref: winner, game: link(winner) }] });
  }

  for (const photo of gallery) {
    if (photo.date && ISO.test(photo.date)) events.push({ kind: 'photo', key: photo.date, day: photo.date, games: photo.games.map((ref) => ({ ref, game: link(ref) })), photo });
  }

  // Within a day: posts and photos, then trophies, completions and acquisitions.
  const order: EventKind[] = ['goty', 'gotm', 'blog', 'photo', 'trophy', 'completed', 'acquired'];
  for (const e of events) e.games.sort((a, b) => a.ref.title.localeCompare(b.ref.title));
  return events.sort((a, b) => b.key.localeCompare(a.key) || order.indexOf(a.kind) - order.indexOf(b.kind));
}
