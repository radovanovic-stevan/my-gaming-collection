import type { AwardValue, BlogPost, ChecklistCollection, ChecklistItem, Game, GalleryEntry, GameConsole, GotcData, GotmMonth, PlayStatus, PlayedGame, Vinyl, WithImages } from '../types';
import { formatDate, formatMonthYear, formatPlaytime, genreLabel } from './format';

/** Everything a visitor can see, as it was published. */
export interface Snapshot {
  games: Game[];
  gotm: GotmMonth[];
  gotc: GotcData;
  gallery: GalleryEntry[];
  dylanDog: ChecklistCollection;
  vinyl: Vinyl[];
  consoles: GameConsole[];
  blog: BlogPost[];
}

export interface Change {
  title: string;
  isNew: boolean;
  details: string[];
  /** What to open on the item's tab: a game or record id, a month (yyyy-mm), a year. */
  itemId?: number | string;
}

export type ChangeTab = 'collection' | 'gotm' | 'gotc' | 'gallery' | 'consoles' | 'blog' | 'dylan-dog' | 'vinyl';

export interface ChangeGroup {
  tab: ChangeTab;
  label: string;
  changes: Change[];
}

// The site shares its origin with the owner's other GitHub Pages sites, hence the prefix.
const STORAGE_KEY = 'game-collection:last-visit';
const VERSION = 1;

/** The snapshot saved on the previous visit, or null on a first visit. */
export function loadSnapshot(): Snapshot | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved?.v === VERSION ? saved.data : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(data: Snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, data }));
  } catch {
    // Storage is full or blocked: the next visit counts as a first one.
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const empty = (v: unknown) => v === null || v === undefined || v === '';

/** The items that are new or differ from before. Removed items are left out. */
function diffList<T>(before: T[], after: T[], key: (item: T) => string | number, describe: (item: T, old: T | undefined) => Change): Change[] {
  const old = new Map(before.map((item) => [key(item), item]));
  return after
    .filter((item) => !same(item, old.get(key(item))))
    .map((item) => {
      const change = describe(item, old.get(key(item)));
      if (!change.isNew && !change.details.length) change.details.push('Details changed');
      return change;
    });
}

function field<V>(out: string[], label: string, a: V, b: V, fmt: (v: V) => string = String) {
  if (same(a, b)) return;
  if (empty(a)) out.push(`${label}: ${fmt(b)}`);
  else if (empty(b)) out.push(`${label} removed`);
  else out.push(`${label}: ${fmt(a)} → ${fmt(b)}`);
}

function listField(out: string[], label: string, a: string[], b: string[]) {
  const added = b.filter((x) => !a.includes(x)).map((x) => `+${x}`);
  const removed = a.filter((x) => !b.includes(x)).map((x) => `-${x}`);
  if (added.length || removed.length) out.push(`${label}: ${[...added, ...removed].join(', ')}`);
}

function textField(out: string[], label: string, a: string, b: string) {
  if (a !== b) out.push(empty(a) ? `${label} added` : empty(b) ? `${label} removed` : `${label} edited`);
}

function photos(out: string[], a: WithImages, b: WithImages) {
  const added = b.images.filter((f) => !a.images.includes(f)).length;
  if (added) out.push(added === 1 ? 'New photo' : `${added} new photos`);
  else if (b.cover && b.cover !== a.cover) out.push('New cover picked');
}

function games(before: Game[], after: Game[]): Change[] {
  return diffList(before, after, (g) => g.id, (g, old) => {
    const change: Change = { title: `${g.title} (${g.platform})`, isNew: !old, details: [], itemId: g.id };
    if (!old) return change;
    const d = change.details;
    if (old.title !== g.title) d.push(`Renamed from "${old.title}"`);
    field(d, 'Platform', old.platform, g.platform);
    field(d, 'Status', old.status, g.status);
    field(d, 'Rating', old.rating, g.rating);
    field(d, 'Acquired', old.acquired, g.acquired, formatDate);
    field(d, 'Completed', old.completed, g.completed, formatDate);
    field(d, 'Times completed', old.timesCompleted, g.timesCompleted);
    field(d, 'Completion', old.percent, g.percent, (n) => `${n}%`);
    field(d, 'Playtime', old.playtime, g.playtime, formatPlaytime);
    listField(d, 'Genres', old.genres.map(genreLabel), g.genres.map(genreLabel));
    listField(d, 'Condition', old.condition, g.condition);
    field(d, 'Edition', old.edition, g.edition);
    field(d, 'Bought in', old.boughtIn ?? null, g.boughtIn ?? null);
    if ((old.trophies ?? null) !== (g.trophies ?? null)) d.push(g.trophies ? (old.trophies ? 'Trophy list link changed' : 'Trophy list added') : 'Trophy list removed');
    photos(d, old, g);
    return change;
  });
}

const PLAY_STATUS_WORDS: Record<PlayStatus, string> = {
  completed: 'completed',
  'in-progress': 'in progress',
  played: 'played',
  'post-completion': 'played after completing',
};

function gotm(before: GotmMonth[], after: GotmMonth[]): Change[] {
  const all = (m: GotmMonth) => [m.gameOfTheMonth, ...m.played].filter((g): g is PlayedGame => g !== null);
  const key = (g: PlayedGame) => `${g.title}|${g.platform}`;
  return diffList(before, after, (m) => m.month, (m, old) => {
    const change: Change = { title: formatMonthYear(m.month), isNew: !old, details: [], itemId: m.month };
    const d = change.details;
    if (!old) {
      if (m.gameOfTheMonth) d.push(`Game of the Month: ${m.gameOfTheMonth.title}`);
      if (all(m).length) d.push(`${plural(all(m).length, 'game')} played`);
      return change;
    }
    field(d, 'Game of the Month', old.gameOfTheMonth?.title ?? null, m.gameOfTheMonth?.title ?? null);
    const oldGames = new Map(all(old).map((g) => [key(g), g]));
    const added = all(m).filter((g) => !oldGames.has(key(g)));
    if (added.length) d.push(`Played: ${added.map((g) => g.title).join(', ')}`);
    for (const g of all(m)) {
      const was = oldGames.get(key(g));
      if (was && was.status !== g.status && g.status) d.push(`${g.title} → ${PLAY_STATUS_WORDS[g.status]}`);
    }
    field(d, 'Completed', old.completed, m.completed);
    field(d, 'Bought', old.bought, m.bought);
    return change;
  });
}

const winnerName = (v: AwardValue | null) => (v ? ('title' in v ? v.title : v.text) : null);

function gotc(before: GotcData, after: GotcData): Change[] {
  const changes = diffList(before.years, after.years, (y) => y.year, (y, old) => {
    const change: Change = { title: `${y.year} awards`, isNew: !old, details: [], itemId: y.year };
    const d = change.details;
    if (!old) {
      d.push(plural(y.awards.filter((a) => a.winner).length, 'category'));
      return change;
    }
    for (const award of y.awards) {
      const was = old.awards.find((a) => a.category === award.category);
      field(d, award.category, winnerName(was?.winner ?? null), winnerName(award.winner));
    }
    if (!same(old.stats, y.stats)) d.push('Stats updated');
    return change;
  });
  if (before.about !== after.about) changes.push({ title: 'About the awards', isNew: false, details: ['Text edited'] });
  return changes;
}

function gallery(before: GalleryEntry[], after: GalleryEntry[]): Change[] {
  const names = (e: GalleryEntry) => e.games.map((g) => g.title);
  return diffList(before, after, (e) => e.id, (e, old) => {
    const first = e.description.split('\n')[0].trim();
    const title = first ? (first.length > 70 ? `${first.slice(0, 70)}…` : first) : e.date ? `Picture from ${formatDate(e.date)}` : 'Picture';
    const change: Change = { title, isNew: !old, details: [], itemId: e.id };
    const d = change.details;
    if (!old) {
      if (e.games.length) d.push(`Shows ${names(e).join(', ')}`);
      return change;
    }
    if (old.image !== e.image) d.push('New picture');
    field(d, 'Date', old.date, e.date, formatDate);
    textField(d, 'Description', old.description, e.description);
    listField(d, 'Games', names(old), names(e));
    return change;
  });
}

/** Issue numbers as ranges ("#1-4, #7"); titled books by name. */
function describeItems(items: ChecklistItem[]): string {
  const numbers = items.map((i) => Number(i.label)).filter(Number.isInteger).sort((a, b) => a - b);
  const titles = items.filter((i) => !Number.isInteger(Number(i.label))).map((i) => i.label);
  const ranges: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (numbers[j + 1] === numbers[j] + 1) j++;
    ranges.push(j === i ? `#${numbers[i]}` : `#${numbers[i]}-${numbers[j]}`);
    i = j;
  }
  return [...ranges, ...titles].join(', ');
}

function checklist(before: ChecklistCollection, after: ChecklistCollection): Change[] {
  return diffList(before.series, after.series, (s) => s.id, (s, old) => {
    const change: Change = { title: s.name, isNew: !old, details: [], itemId: s.id };
    const d = change.details;
    const owned = s.items.filter((i) => i.owned);
    if (!old) {
      d.push(`${owned.length} of ${s.items.length} owned`);
      return change;
    }
    if (old.name !== s.name) d.push(`Renamed from "${old.name}"`);
    const was = new Map(old.items.map((i) => [i.label, i]));
    const ticked = owned.filter((i) => !was.get(i.label)?.owned);
    const unticked = s.items.filter((i) => !i.owned && was.get(i.label)?.owned);
    const missing = s.items.filter((i) => !i.owned && !was.has(i.label));
    if (ticked.length) d.push(`Ticked off ${describeItems(ticked)}`);
    if (missing.length) d.push(`Added as missing: ${describeItems(missing)}`);
    if (unticked.length) d.push(`No longer owned: ${describeItems(unticked)}`);
    return change;
  });
}

function vinyl(before: Vinyl[], after: Vinyl[]): Change[] {
  return diffList(before, after, (r) => r.id, (r, old) => {
    const change: Change = { title: `${r.artist} - ${r.title}`, isNew: !old, details: [], itemId: r.id };
    if (!old) return change;
    const d = change.details;
    if (old.artist !== r.artist || old.title !== r.title) d.push(`Renamed from "${old.artist} - ${old.title}"`);
    const played = r.listens.length - old.listens.length;
    if (played > 0) d.push(`${plural(played, 'new side')} played`);
    else if (!same(old.listens, r.listens)) d.push('Listening log updated');
    photos(d, old, r);
    return change;
  });
}

function consoles(before: GameConsole[], after: GameConsole[]): Change[] {
  return diffList(before, after, (c) => c.id, (c, old) => {
    const change: Change = { title: c.name, isNew: !old, details: [], itemId: c.id };
    if (!old) return change;
    const d = change.details;
    if (old.name !== c.name) d.push(`Renamed from "${old.name}"`);
    field(d, 'Maker', old.maker, c.maker);
    field(d, 'Platform', old.platform, c.platform);
    field(d, 'Acquired', old.acquired, c.acquired, formatDate);
    listField(d, 'Models', old.models.map((m) => m.name), c.models.map((m) => m.name));
    textField(d, 'Notes', old.notes, c.notes);
    photos(d, old, c);
    return change;
  });
}

function blog(before: BlogPost[], after: BlogPost[]): Change[] {
  return diffList(before, after, (p) => p.id, (p, old) => {
    const change: Change = { title: p.title, isNew: !old, details: [], itemId: p.id };
    const d = change.details;
    if (!old) {
      d.push(formatDate(p.date));
      return change;
    }
    if (old.title !== p.title) d.push(`Renamed from "${old.title}"`);
    field(d, 'Date', old.date, p.date, formatDate);
    if (old.body !== p.body) d.push('Post edited');
    if (p.cover && p.cover !== old.cover) d.push('New cover picture');
    return change;
  });
}

export function findChanges(before: Snapshot, after: Snapshot): ChangeGroup[] {
  const groups: ChangeGroup[] = [
    { tab: 'collection', label: 'Collection', changes: games(before.games, after.games) },
    { tab: 'gotm', label: 'Game of the Month', changes: gotm(before.gotm, after.gotm) },
    { tab: 'gotc', label: 'Awards', changes: gotc(before.gotc, after.gotc) },
    { tab: 'gallery', label: 'Gallery', changes: gallery(before.gallery, after.gallery) },
    { tab: 'consoles', label: 'Consoles', changes: consoles(before.consoles, after.consoles) },
    { tab: 'blog', label: 'Blog', changes: blog(before.blog, after.blog) },
    { tab: 'dylan-dog', label: after.dylanDog.title, changes: checklist(before.dylanDog, after.dylanDog) },
    { tab: 'vinyl', label: 'Vinyl', changes: vinyl(before.vinyl, after.vinyl) },
  ];
  return groups.filter((g) => g.changes.length);
}
