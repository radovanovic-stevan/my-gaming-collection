import type { Game, Query, SortKey, SortLevel } from '../types';

export const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  platform: 'Platform',
  rating: 'Rating',
  status: 'Status',
  acquired: 'Acquired',
  completed: 'Completed on',
  playtime: 'Playtime',
  timesCompleted: 'Times completed',
  percent: '% complete',
  id: 'Collection #',
};

export const DEFAULT_QUERY: Query = {
  search: '',
  platforms: [],
  statuses: [],
  genres: [],
  conditions: [],
  ratingMin: null,
  ratingMax: null,
  cover: 'any',
  sort: [
    { key: 'rating', dir: 'desc' },
    { key: 'title', dir: 'asc' },
  ],
  view: 'grid',
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Turns ISO dates and loose text ("Late 2013 - Early 2014", "Before 2012") into a sortable yyyy-mm-dd key. */
export function dateKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const year = value.match(/\d{4}/)?.[0];
  if (!year) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('before')) return `${Number(year) - 1}-12-31`;
  const month = MONTHS.findIndex((m) => lower.includes(m));
  if (month >= 0) return `${year}-${String(month + 1).padStart(2, '0')}-15`;
  if (lower.startsWith('day 1') || lower.startsWith('early')) return `${year}-02-01`;
  if (lower.startsWith('late')) return `${year}-10-01`;
  return `${year}-06-30`;
}

function sortValue(g: Game, key: SortKey): string | number | null {
  switch (key) {
    case 'acquired':
    case 'completed':
      return dateKey(g[key]);
    case 'title':
    case 'platform':
    case 'status':
      return g[key].toLowerCase();
    default:
      return g[key];
  }
}

function compare(a: Game, b: Game, levels: SortLevel[]): number {
  for (const { key, dir } of levels) {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === vb) continue;
    // Missing values always go last, whatever the direction.
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    if (c !== 0) return dir === 'asc' ? c : -c;
  }
  return a.id - b.id;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function matchesSearch(g: Game, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = normalize([g.title, g.platform, g.edition, g.note, g.genres.join(' '), String(g.id)].join(' '));
  return terms.every((t) => hay.includes(t));
}

const anyOf = (selected: string[], values: string[]) => selected.length === 0 || selected.some((s) => values.includes(s));

export function applyQuery(games: Game[], q: Query): Game[] {
  const terms = normalize(q.search).split(' ').filter(Boolean);
  return games
    .filter(
      (g) =>
        matchesSearch(g, terms) &&
        anyOf(q.platforms, [g.platform]) &&
        anyOf(q.statuses, [g.status]) &&
        // Genres narrow the list: a game must have every selected genre.
        q.genres.every((x) => g.genres.includes(x)) &&
        anyOf(q.conditions, g.condition) &&
        (q.ratingMin === null || (g.rating !== null && g.rating >= q.ratingMin)) &&
        (q.ratingMax === null || (g.rating !== null && g.rating <= q.ratingMax)) &&
        (q.cover === 'any' || (q.cover === 'with') === Boolean(g.cover)),
    )
    .sort((a, b) => compare(a, b, q.sort));
}

/** Distinct values with counts, most common first. */
export function facet(games: Game[], pick: (g: Game) => string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const g of games) for (const v of pick(g)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// --- URL state -------------------------------------------------------------

const LIST_KEYS = ['platforms', 'statuses', 'genres', 'conditions'] as const;

export function queryToParams(q: Query): string {
  const p = new URLSearchParams();
  if (q.search) p.set('q', q.search);
  for (const k of LIST_KEYS) if (q[k].length) p.set(k, q[k].join('~'));
  if (q.ratingMin !== null) p.set('min', String(q.ratingMin));
  if (q.ratingMax !== null) p.set('max', String(q.ratingMax));
  if (q.cover !== 'any') p.set('cover', q.cover);
  const sort = sortToParam(q.sort);
  if (sort !== sortToParam(DEFAULT_QUERY.sort)) p.set('sort', sort);
  if (q.view !== DEFAULT_QUERY.view) p.set('view', q.view);
  return p.toString();
}

const sortToParam = (sort: SortLevel[]) => sort.map((s) => `${s.dir === 'desc' ? '-' : ''}${s.key}`).join(',');

export function paramsToQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const q: Query = { ...DEFAULT_QUERY };
  q.search = p.get('q') ?? '';
  for (const k of LIST_KEYS) q[k] = p.get(k)?.split('~').filter(Boolean) ?? [];
  const num = (v: string | null) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  q.ratingMin = num(p.get('min'));
  q.ratingMax = num(p.get('max'));
  const cover = p.get('cover');
  q.cover = cover === 'with' || cover === 'without' ? cover : 'any';
  const sort = p.get('sort');
  if (sort) {
    const levels = sort
      .split(',')
      .map((s): SortLevel => ({ key: s.replace(/^-/, '') as SortKey, dir: s.startsWith('-') ? 'desc' : 'asc' }))
      .filter((s) => s.key in SORT_LABELS);
    if (levels.length) q.sort = levels;
  }
  q.view = p.get('view') === 'table' ? 'table' : 'grid';
  return q;
}
