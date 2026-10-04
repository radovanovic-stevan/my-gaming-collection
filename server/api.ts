// Local-only editing API, mounted on the Vite dev server (`npm run dev`).
// Everything is persisted straight to the file system:
//   public/data/games.json  - the collection
//   public/images/          - game images, named <id>-<hash>.<ext>
//   public/data/gotm.json   - Game of the Month, one entry per month
//   public/data/gotc.json   - Game of the Category: yearly awards and stats
//   public/data/gallery.json - Gallery: pictures with a date, a description and the games in them
//   public/data/<slug>.json  - other collections (e.g. dylan-dog.json): a checklist per series
//   public/data/vinyl.json   - vinyl records and when each side was played; images are vinyl-<id>-<hash>.<ext>
//   public/data/consoles.json - consoles and the models owned; images are console-<id>-<hash>.<ext>
//   public/data/blog.json    - blog posts; cover images are blog-<id>-<hash>.jpg
// Each game lists its images in `images`; `cover` is one of them (or null).
// The static build (GitHub Pages) has no API, so the app is read-only there.
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const GAMES_FILE = path.join(ROOT, 'public/data/games.json');
const IMAGES_DIR = path.join(ROOT, 'public/images');
const GOTM_FILE = path.join(ROOT, 'public/data/gotm.json');
const GOTC_FILE = path.join(ROOT, 'public/data/gotc.json');
const GALLERY_FILE = path.join(ROOT, 'public/data/gallery.json');
const VINYL_FILE = path.join(ROOT, 'public/data/vinyl.json');
const CONSOLES_FILE = path.join(ROOT, 'public/data/consoles.json');
const BLOG_FILE = path.join(ROOT, 'public/data/blog.json');

const STATUSES = ['Completed', 'Not Completed', 'Null', 'Unplayable', 'Unrateable'];
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BODY = 15 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(IMAGE_TYPES).map(([mime, ext]) => [ext, mime])),
  json: 'application/json',
};

type Game = Record<string, unknown> & { id: number; images: string[]; cover: string | null };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Serialize all writes so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

async function loadGames(): Promise<Game[]> {
  return JSON.parse(await readFile(GAMES_FILE, 'utf8'));
}

async function saveGames(games: Game[]) {
  games.sort((a, b) => a.id - b.id);
  const tmp = `${GAMES_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(games, null, 1) + '\n');
  await rename(tmp, GAMES_FILE);
}

async function loadJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function saveJson(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1) + '\n');
  await rename(tmp, file);
}

async function removeImageFile(file: string) {
  await unlink(path.join(IMAGES_DIR, path.basename(file))).catch(() => {});
}

/** Deletes game image files, keeping any that another game still uses (e.g. one console photo shared by its built-in games). */
async function removeUnusedGameImages(files: string[], games: Game[]) {
  const used = new Set(games.flatMap((g) => g.images));
  await Promise.all(files.filter((f) => !used.has(f)).map(removeImageFile));
}

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const nullableStr = (v: unknown) => str(v) || null;
const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : []);
function num(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a number`);
  return n;
}

/** A PSNProfiles trophy-list link, or null. */
function trophiesUrl(v: unknown): string | null {
  const url = str(v);
  if (!url) return null;
  if (!/^https:\/\/psnprofiles\.com\/trophies\/\S+$/.test(url)) throw new HttpError(400, 'Trophies must be a https://psnprofiles.com/trophies/… link');
  return url;
}

/** Whitelists and normalizes the editable fields of a game. */
function sanitize(input: Record<string, unknown>): Omit<Game, 'id' | 'images' | 'cover'> {
  const title = str(input.title);
  const platform = str(input.platform);
  const status = str(input.status);
  if (!title) throw new HttpError(400, 'Title is required');
  if (!platform) throw new HttpError(400, 'Platform is required');
  if (!STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${STATUSES.join(', ')}`);
  return {
    title,
    platform,
    acquired: nullableStr(input.acquired),
    completed: nullableStr(input.completed),
    status,
    rating: num(input.rating, 'Rating'),
    timesCompleted: num(input.timesCompleted, 'Times completed'),
    percent: num(input.percent, '% complete'),
    playtime: num(input.playtime, 'Playtime'),
    genres: strList(input.genres),
    condition: strList(input.condition),
    edition: str(input.edition),
    trophies: trophiesUrl(input.trophies),
    boughtIn: nullableStr(input.boughtIn),
  };
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function findIndex(games: Game[], id: number) {
  const i = games.findIndex((g) => g.id === id);
  if (i < 0) throw new HttpError(404, `Game #${id} not found`);
  return i;
}

// --- Game of the Month / Game of the Category ---------------------------------

const PLAY_STATUSES = ['completed', 'in-progress', 'played', 'post-completion'];

type GameRef = { title: string; platform: string };
type Played = GameRef & { status: string | null };
type AwardValue = GameRef | { text: string };
type GotmMonth = { month: string; gameOfTheMonth: Played | null; completed: number; bought: number | null; played: Played[] };
type GotcYear = { year: number; awards: { category: string; winner: AwardValue | null }[]; stats: Record<string, unknown> };
type GotcData = { about: string; years: GotcYear[] };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function gameRef(v: unknown, field: string): GameRef {
  const title = str(obj(v).title);
  const platform = str(obj(v).platform);
  if (!title || !platform) throw new HttpError(400, `${field} needs a title and a platform`);
  return { title, platform };
}

function played(v: unknown, field: string): Played {
  const status = obj(v).status ?? null;
  if (status !== null && !PLAY_STATUSES.includes(String(status))) throw new HttpError(400, `${field} has an unknown status`);
  return { ...gameRef(v, field), status: status as string | null };
}

/** A game ({title, platform}), free text ({text}), or null for "no winner". */
function awardValue(v: unknown): AwardValue | null {
  if (v === null || v === undefined) return null;
  const o = obj(v);
  if (str(o.platform)) return gameRef(o, 'Winner');
  const text = str(o.text ?? o.title);
  return text ? { text } : null;
}

function sanitizeMonth(input: Record<string, unknown>): GotmMonth {
  const month = str(input.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Month must look like 2026-09');
  const gotm = input.gameOfTheMonth ? played(input.gameOfTheMonth, 'Game of the Month') : null;
  const list = (Array.isArray(input.played) ? input.played : []).map((g, i) => played(g, `Game ${i + 1}`));
  // Same rule the sheet follows: completed = everything marked completed, including the winner.
  const completed = [gotm, ...list].filter((g) => g?.status === 'completed').length;
  return { month, gameOfTheMonth: gotm, completed, bought: num(input.bought, 'Bought'), played: list };
}

function sanitizeYear(input: Record<string, unknown>): GotcYear {
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) throw new HttpError(400, 'Year must be a four-digit year');
  const awards = (Array.isArray(input.awards) ? input.awards : [])
    .map((a) => ({ category: str(obj(a).category), winner: awardValue(obj(a).winner) }))
    .filter((a) => a.category);
  const s = obj(input.stats);
  const stats: Record<string, unknown> = {};
  const completed = num(s.gamesCompleted, 'Games completed');
  const bought = num(s.gamesBought, 'Games bought');
  if (completed !== null) stats.gamesCompleted = completed;
  if (bought !== null) stats.gamesBought = bought;
  const consoles = strList(s.consolesBought);
  if (consoles.length) stats.consolesBought = consoles;
  const multi = (Array.isArray(s.multipleGotmWinners) ? s.multipleGotmWinners : []).map((g) => gameRef(g, 'GOTM winner'));
  if (multi.length) stats.multipleGotmWinners = multi;
  // A list; a string (one mention per line) is accepted too.
  const mentions = strList(typeof s.honorableMentions === 'string' ? s.honorableMentions.split('\n') : s.honorableMentions);
  if (mentions.length) stats.honorableMentions = mentions;
  const changes = (Array.isArray(s.ratingChanges) ? s.ratingChanges : [])
    .map((r) => ({ title: str(obj(r).title), from: num(obj(r).from, 'Rating from'), to: num(obj(r).to, 'Rating to') }))
    .filter((r) => r.title && r.from !== null && r.to !== null);
  if (changes.length) stats.ratingChanges = changes;
  return { year, awards, stats };
}

/** Routes under /api/gotm and /api/gotc. Returns false when the path isn't one of them. */
async function handleAwards(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // PUT /api/gotm/:month (creates or replaces; a different body.month moves the entry)
  // DELETE /api/gotm/:month
  if (parts[0] === 'gotm' && parts.length === 2) {
    const key = parts[1];
    if (method === 'PUT') {
      const month = sanitizeMonth(await readBody(req));
      await exclusive(async () => {
        const months = await loadJson<GotmMonth[]>(GOTM_FILE);
        if (month.month !== key && months.some((m) => m.month === month.month)) throw new HttpError(409, `${month.month} already exists`);
        const next = months.filter((m) => m.month !== key && m.month !== month.month);
        next.push(month);
        next.sort((a, b) => b.month.localeCompare(a.month));
        await saveJson(GOTM_FILE, next);
      });
      send(res, 200, month);
      return true;
    }
    if (method === 'DELETE') {
      await exclusive(async () => {
        const months = await loadJson<GotmMonth[]>(GOTM_FILE);
        if (!months.some((m) => m.month === key)) throw new HttpError(404, `${key} not found`);
        await saveJson(GOTM_FILE, months.filter((m) => m.month !== key));
      });
      send(res, 200, { ok: true });
      return true;
    }
  }

  // PUT /api/gotc/years/:year, DELETE /api/gotc/years/:year
  if (parts[0] === 'gotc' && parts[1] === 'years' && parts.length === 3) {
    const key = Number(parts[2]);
    if (method === 'PUT') {
      const year = sanitizeYear(await readBody(req));
      await exclusive(async () => {
        const data = await loadJson<GotcData>(GOTC_FILE);
        if (year.year !== key && data.years.some((y) => y.year === year.year)) throw new HttpError(409, `${year.year} already exists`);
        data.years = [...data.years.filter((y) => y.year !== key && y.year !== year.year), year].sort((a, b) => b.year - a.year);
        await saveJson(GOTC_FILE, data);
      });
      send(res, 200, year);
      return true;
    }
    if (method === 'DELETE') {
      await exclusive(async () => {
        const data = await loadJson<GotcData>(GOTC_FILE);
        if (!data.years.some((y) => y.year === key)) throw new HttpError(404, `${key} not found`);
        data.years = data.years.filter((y) => y.year !== key);
        await saveJson(GOTC_FILE, data);
      });
      send(res, 200, { ok: true });
      return true;
    }
  }

  if (parts[0] === 'gotm' || parts[0] === 'gotc') throw new HttpError(405, 'Method not allowed');
  return false;
}

// --- Gallery -------------------------------------------------------------------

type GalleryEntry = { id: number; image: string; date: string | null; description: string; games: GameRef[] };

/** Decodes an uploaded image and writes it to public/images as <prefix>-<hash>.<ext>. */
async function saveUpload(dataUrl: unknown, prefix: string): Promise<string> {
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m || !IMAGE_TYPES[m[1]]) throw new HttpError(400, 'Expected a JPEG, PNG, WebP or GIF data URL');
  const bytes = Buffer.from(m[2], 'base64');
  const file = `${prefix}-${createHash('sha1').update(bytes).digest('hex').slice(0, 8)}.${IMAGE_TYPES[m[1]]}`;
  await writeFile(path.join(IMAGES_DIR, file), bytes);
  return file;
}

function sanitizeGalleryEntry(input: Record<string, unknown>): Omit<GalleryEntry, 'id' | 'image'> {
  const date = str(input.date) || null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Date must look like 2026-09-26');
  const games = (Array.isArray(input.games) ? input.games : []).map((g, i) => gameRef(g, `Game ${i + 1}`));
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  return { date, description, games };
}

/** Newest pictures first; undated ones last. */
const sortGallery = (entries: GalleryEntry[]) =>
  entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id);

const loadGallery = () => loadJson<GalleryEntry[]>(GALLERY_FILE).catch((e) => (e.code === 'ENOENT' ? [] : Promise.reject(e)));

/** Routes under /api/gallery. Returns false when the path isn't one of them. */
async function handleGallery(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (parts[0] !== 'gallery') return false;
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const findEntry = (entries: GalleryEntry[]) => {
    const i = entries.findIndex((e) => e.id === id);
    if (i < 0) throw new HttpError(404, `Picture #${id} not found`);
    return i;
  };

  // POST /api/gallery   body: { dataUrl, date, description, games }
  if (id === null && parts.length === 1 && method === 'POST') {
    const body = await readBody(req);
    const fields = sanitizeGalleryEntry(body);
    const entry = await exclusive(async () => {
      const entries = await loadGallery();
      const created: GalleryEntry = { id: Math.max(0, ...entries.map((e) => e.id)) + 1, image: '', ...fields };
      created.image = await saveUpload(body.dataUrl, `gallery-${created.id}`);
      await saveJson(GALLERY_FILE, sortGallery([...entries, created]));
      return created;
    });
    send(res, 201, entry);
    return true;
  }

  // PUT /api/gallery/:id   body: { date, description, games, dataUrl? }  (a dataUrl replaces the picture)
  if (id !== null && parts.length === 2 && method === 'PUT') {
    const body = await readBody(req);
    const fields = sanitizeGalleryEntry(body);
    const entry = await exclusive(async () => {
      const entries = await loadGallery();
      const i = findEntry(entries);
      let image = entries[i].image;
      if (body.dataUrl) {
        const replaced = image;
        image = await saveUpload(body.dataUrl, `gallery-${id}`);
        if (replaced !== image) await removeImageFile(replaced);
      }
      entries[i] = { id, image, ...fields };
      const saved = entries[i];
      await saveJson(GALLERY_FILE, sortGallery(entries));
      return saved;
    });
    send(res, 200, entry);
    return true;
  }

  // DELETE /api/gallery/:id
  if (id !== null && parts.length === 2 && method === 'DELETE') {
    await exclusive(async () => {
      const entries = await loadGallery();
      const [removed] = entries.splice(findEntry(entries), 1);
      await saveJson(GALLERY_FILE, entries);
      await removeImageFile(removed.image);
    });
    send(res, 200, { ok: true });
    return true;
  }

  throw new HttpError(405, 'Method not allowed');
}

// --- Other collections (checklists) --------------------------------------------

type ChecklistSeries = { id: number; name: string; kind: 'numbers' | 'titles'; items: { label: string; owned: boolean }[] };
type ChecklistCollection = { title: string; series: ChecklistSeries[] };

const COLLECTION_SLUGS = ['dylan-dog'];

function sanitizeSeries(input: Record<string, unknown>): Omit<ChecklistSeries, 'id'> {
  const name = str(input.name);
  if (!name) throw new HttpError(400, 'Series name is required');
  const kind = input.kind === 'titles' ? 'titles' : 'numbers';
  const seen = new Set<string>();
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((it) => ({ label: str(obj(it).label), owned: obj(it).owned === true }))
    .filter((it) => it.label && !seen.has(it.label) && seen.add(it.label));
  if (kind === 'numbers') {
    const bad = items.find((it) => !/^\d+$/.test(it.label));
    if (bad) throw new HttpError(400, `"${bad.label}" isn't an issue number`);
    items.sort((a, b) => Number(a.label) - Number(b.label));
  }
  return { name, kind, items };
}

/** Routes under /api/collections/:slug. Returns false when the path isn't one of them. */
async function handleCollections(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (parts[0] !== 'collections') return false;
  const slug = parts[1];
  if (!COLLECTION_SLUGS.includes(slug) || parts[2] !== 'series') throw new HttpError(404, 'Not found');
  const file = path.join(ROOT, `public/data/${slug}.json`);
  const id = parts[3] === undefined ? null : Number(parts[3]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const findSeries = (data: ChecklistCollection) => {
    const i = data.series.findIndex((s) => s.id === id);
    if (i < 0) throw new HttpError(404, `Series #${id} not found`);
    return i;
  };

  // POST /api/collections/:slug/series   (added at the end)
  if (id === null && parts.length === 3 && method === 'POST') {
    const fields = sanitizeSeries(await readBody(req));
    const created = await exclusive(async () => {
      const data = await loadJson<ChecklistCollection>(file);
      const series: ChecklistSeries = { id: Math.max(0, ...data.series.map((s) => s.id)) + 1, ...fields };
      data.series.push(series);
      await saveJson(file, data);
      return series;
    });
    send(res, 201, created);
    return true;
  }

  // PUT /api/collections/:slug/series/:id   body: { name, kind, items, position? }  (position moves it, 0-based)
  if (id !== null && parts.length === 4 && method === 'PUT') {
    const body = await readBody(req);
    const fields = sanitizeSeries(body);
    const saved = await exclusive(async () => {
      const data = await loadJson<ChecklistCollection>(file);
      const i = findSeries(data);
      data.series.splice(i, 1);
      const series: ChecklistSeries = { id, ...fields };
      const position = Number.isInteger(body.position) ? Math.max(0, Math.min(body.position, data.series.length)) : i;
      data.series.splice(position, 0, series);
      await saveJson(file, data);
      return series;
    });
    send(res, 200, saved);
    return true;
  }

  // DELETE /api/collections/:slug/series/:id
  if (id !== null && parts.length === 4 && method === 'DELETE') {
    await exclusive(async () => {
      const data = await loadJson<ChecklistCollection>(file);
      data.series.splice(findSeries(data), 1);
      await saveJson(file, data);
    });
    send(res, 200, { ok: true });
    return true;
  }

  throw new HttpError(405, 'Method not allowed');
}

// --- Vinyl -----------------------------------------------------------------------

type Vinyl = { id: number; artist: string; title: string; acquired: string | null; images: string[]; cover: string | null; listens: { side: string; date: string | null }[] };

function sanitizeVinyl(input: Record<string, unknown>): Pick<Vinyl, 'artist' | 'title' | 'acquired' | 'listens'> {
  const artist = str(input.artist);
  const title = str(input.title);
  if (!artist) throw new HttpError(400, 'Artist is required');
  if (!title) throw new HttpError(400, 'Title is required');
  const listens = (Array.isArray(input.listens) ? input.listens : []).map((l, i) => {
    const side = str(obj(l).side).toUpperCase();
    const date = str(obj(l).date) || null;
    if (!side) throw new HttpError(400, `Listen ${i + 1} needs a side`);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, `Listen ${i + 1}: date must look like 2026-09-28`);
    return { side, date };
  });
  const acquired = nullableStr(input.acquired);
  if (acquired !== null && !/^\d{4}-\d{2}-\d{2}$/.test(acquired)) throw new HttpError(400, 'Acquired must look like 2026-09-28');
  return { artist, title, acquired, listens };
}

const sortVinyl = (records: Vinyl[]) => records.sort((a, b) => a.id - b.id);

/** Routes under /api/vinyl. Returns false when the path isn't one of them. */
async function handleVinyl(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (parts[0] !== 'vinyl') return false;
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  /** Loads the records, lets `fn` change the one with this id, and saves. */
  const change = (fn: (records: Vinyl[], i: number) => Promise<Vinyl | null>) =>
    exclusive(async () => {
      const records = await loadJson<Vinyl[]>(VINYL_FILE);
      const i = records.findIndex((r) => r.id === id);
      if (i < 0) throw new HttpError(404, `Record #${id} not found`);
      const result = await fn(records, i);
      await saveJson(VINYL_FILE, sortVinyl(records));
      return result;
    });

  // POST /api/vinyl
  if (id === null && parts.length === 1 && method === 'POST') {
    const fields = sanitizeVinyl(await readBody(req));
    const created = await exclusive(async () => {
      const records = await loadJson<Vinyl[]>(VINYL_FILE);
      const record: Vinyl = { id: Math.max(0, ...records.map((r) => r.id)) + 1, ...fields, images: [], cover: null };
      await saveJson(VINYL_FILE, sortVinyl([...records, record]));
      return record;
    });
    send(res, 201, created);
    return true;
  }
  if (id === null) throw new HttpError(405, 'Method not allowed');

  // PUT /api/vinyl/:id   body: { artist, title, acquired, listens }
  if (parts.length === 2 && method === 'PUT') {
    const fields = sanitizeVinyl(await readBody(req));
    send(res, 200, await change(async (records, i) => (records[i] = { ...records[i], ...fields })));
    return true;
  }

  // DELETE /api/vinyl/:id
  if (parts.length === 2 && method === 'DELETE') {
    await change(async (records, i) => {
      const [removed] = records.splice(i, 1);
      await Promise.all(removed.images.map(removeImageFile));
      return null;
    });
    send(res, 200, { ok: true });
    return true;
  }

  // POST /api/vinyl/:id/images   body: { dataUrl }  (the first image becomes the cover)
  if (parts[2] === 'images' && parts.length === 3 && method === 'POST') {
    const { dataUrl } = await readBody(req);
    const saved = await change(async (records, i) => {
      const r = records[i];
      const file = await saveUpload(dataUrl, `vinyl-${id}`);
      if (!r.images.includes(file)) records[i] = { ...r, images: [...r.images, file], cover: r.cover ?? file };
      return records[i];
    });
    send(res, 200, saved);
    return true;
  }

  // DELETE /api/vinyl/:id/images/:file   (a removed cover passes to the next image)
  if (parts[2] === 'images' && parts.length === 4 && method === 'DELETE') {
    const file = decodeURIComponent(parts[3]);
    const saved = await change(async (records, i) => {
      const r = records[i];
      if (!r.images.includes(file)) throw new HttpError(404, `Image ${file} not found`);
      const images = r.images.filter((f) => f !== file);
      records[i] = { ...r, images, cover: r.cover === file ? (images[0] ?? null) : r.cover };
      await removeImageFile(file);
      return records[i];
    });
    send(res, 200, saved);
    return true;
  }

  // PUT /api/vinyl/:id/cover   body: { file }
  if (parts[2] === 'cover' && parts.length === 3 && method === 'PUT') {
    const { file } = await readBody(req);
    const saved = await change(async (records, i) => {
      if (!records[i].images.includes(file)) throw new HttpError(400, "Cover must be one of the record's images");
      return (records[i] = { ...records[i], cover: file });
    });
    send(res, 200, saved);
    return true;
  }

  throw new HttpError(405, 'Method not allowed');
}

// --- Consoles ------------------------------------------------------------------------

type ConsoleModel = { name: string; image: string | null };
type GameConsole = {
  id: number; name: string; maker: string; platform: string | null; acquired: string | null; notes: string;
  models: ConsoleModel[]; images: string[]; cover: string | null;
};

/** The editable fields. A model's picture must be one of the console's `images`, or it's dropped. */
function sanitizeConsole(input: Record<string, unknown>, images: string[]): Omit<GameConsole, 'id' | 'images' | 'cover'> {
  const name = str(input.name);
  if (!name) throw new HttpError(400, 'Name is required');
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const models = (Array.isArray(input.models) ? input.models : [])
    .map((m) => ({ name: str(obj(m).name), image: images.includes(obj(m).image as string) ? (obj(m).image as string) : null }))
    .filter((m) => m.name);
  return { name, maker: str(input.maker), platform: nullableStr(input.platform), acquired: nullableStr(input.acquired), notes, models };
}

const loadList = <T>(file: string) => loadJson<T[]>(file).catch((e) => (e.code === 'ENOENT' ? [] : Promise.reject(e)));

/** Routes under /api/consoles. Returns false when the path isn't one of them. */
async function handleConsoles(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (parts[0] !== 'consoles') return false;
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const byId = (items: GameConsole[]) => items.sort((a, b) => a.id - b.id);
  /** Loads the consoles, lets `fn` change the one with this id, and saves. */
  const change = (fn: (items: GameConsole[], i: number) => Promise<GameConsole | null>) =>
    exclusive(async () => {
      const items = await loadList<GameConsole>(CONSOLES_FILE);
      const i = items.findIndex((r) => r.id === id);
      if (i < 0) throw new HttpError(404, `Console #${id} not found`);
      const result = await fn(items, i);
      await saveJson(CONSOLES_FILE, byId(items));
      return result;
    });

  // POST /api/consoles
  if (id === null && parts.length === 1 && method === 'POST') {
    const fields = sanitizeConsole(await readBody(req), []);
    const created = await exclusive(async () => {
      const items = await loadList<GameConsole>(CONSOLES_FILE);
      const item: GameConsole = { id: Math.max(0, ...items.map((r) => r.id)) + 1, ...fields, images: [], cover: null };
      await saveJson(CONSOLES_FILE, byId([...items, item]));
      return item;
    });
    send(res, 201, created);
    return true;
  }
  if (id === null) throw new HttpError(405, 'Method not allowed');

  // PUT /api/consoles/:id   body: { name, maker, platform, acquired, notes, models }
  if (parts.length === 2 && method === 'PUT') {
    const body = await readBody(req);
    send(res, 200, await change(async (items, i) => (items[i] = { ...items[i], ...sanitizeConsole(body, items[i].images) })));
    return true;
  }

  // DELETE /api/consoles/:id
  if (parts.length === 2 && method === 'DELETE') {
    await change(async (items, i) => {
      const [removed] = items.splice(i, 1);
      await Promise.all(removed.images.map(removeImageFile));
      return null;
    });
    send(res, 200, { ok: true });
    return true;
  }

  // POST /api/consoles/:id/images   body: { dataUrl }  (the first image becomes the cover)
  if (parts[2] === 'images' && parts.length === 3 && method === 'POST') {
    const { dataUrl } = await readBody(req);
    const saved = await change(async (items, i) => {
      const r = items[i];
      const file = await saveUpload(dataUrl, `console-${id}`);
      if (!r.images.includes(file)) items[i] = { ...r, images: [...r.images, file], cover: r.cover ?? file };
      return items[i];
    });
    send(res, 200, saved);
    return true;
  }

  // DELETE /api/consoles/:id/images/:file   (a removed cover passes to the next image; models using it lose their picture)
  if (parts[2] === 'images' && parts.length === 4 && method === 'DELETE') {
    const file = decodeURIComponent(parts[3]);
    const saved = await change(async (items, i) => {
      const r = items[i];
      if (!r.images.includes(file)) throw new HttpError(404, `Image ${file} not found`);
      const images = r.images.filter((f) => f !== file);
      const models = r.models.map((m) => (m.image === file ? { ...m, image: null } : m));
      items[i] = { ...r, images, models, cover: r.cover === file ? (images[0] ?? null) : r.cover };
      await removeImageFile(file);
      return items[i];
    });
    send(res, 200, saved);
    return true;
  }

  // PUT /api/consoles/:id/cover   body: { file }
  if (parts[2] === 'cover' && parts.length === 3 && method === 'PUT') {
    const { file } = await readBody(req);
    const saved = await change(async (items, i) => {
      if (!items[i].images.includes(file)) throw new HttpError(400, "Cover must be one of the console's images");
      return (items[i] = { ...items[i], cover: file });
    });
    send(res, 200, saved);
    return true;
  }

  throw new HttpError(405, 'Method not allowed');
}

// --- Blog ---------------------------------------------------------------------------

type BlogPost = { id: number; title: string; date: string; body: string; cover: string | null; draft?: boolean };

function sanitizePost(input: Record<string, unknown>): Omit<BlogPost, 'id' | 'cover'> {
  const title = str(input.title);
  const date = str(input.date);
  // Keep line breaks, but no more than one blank line in a row.
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (!title) throw new HttpError(400, 'Title is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Date must look like 2026-09-29');
  if (!body) throw new HttpError(400, 'The post is empty');
  // Only drafts carry the flag, so published posts stay as they were.
  return { title, date, body, ...(input.draft === true ? { draft: true } : {}) };
}

/** Newest posts first. */
const sortPosts = (posts: BlogPost[]) => posts.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

/** Routes under /api/blog. Returns false when the path isn't one of them. */
async function handleBlog(parts: string[], method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (parts[0] !== 'blog') return false;
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
  const findPost = (posts: BlogPost[]) => {
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0) throw new HttpError(404, `Post #${id} not found`);
    return i;
  };

  // POST /api/blog   body: { title, date, body, dataUrl? }  (a dataUrl is the cover image)
  if (id === null && parts.length === 1 && method === 'POST') {
    const body = await readBody(req);
    const fields = sanitizePost(body);
    const created = await exclusive(async () => {
      const posts = await loadList<BlogPost>(BLOG_FILE);
      const post: BlogPost = { id: Math.max(0, ...posts.map((p) => p.id)) + 1, ...fields, cover: null };
      if (body.dataUrl) post.cover = await saveUpload(body.dataUrl, `blog-${post.id}`);
      await saveJson(BLOG_FILE, sortPosts([...posts, post]));
      return post;
    });
    send(res, 201, created);
    return true;
  }

  // PUT /api/blog/:id   body: { title, date, body, dataUrl?, cover? }  (a dataUrl replaces the cover; cover: null removes it)
  if (id !== null && parts.length === 2 && method === 'PUT') {
    const body = await readBody(req);
    const fields = sanitizePost(body);
    const saved = await exclusive(async () => {
      const posts = await loadList<BlogPost>(BLOG_FILE);
      const i = findPost(posts);
      let cover = posts[i].cover ?? null;
      if (body.dataUrl || body.cover === null) {
        const replaced = cover;
        cover = body.dataUrl ? await saveUpload(body.dataUrl, `blog-${id}`) : null;
        if (replaced && replaced !== cover) await removeImageFile(replaced);
      }
      const post = (posts[i] = { id, ...fields, cover });
      await saveJson(BLOG_FILE, sortPosts(posts));
      return post;
    });
    send(res, 200, saved);
    return true;
  }

  // DELETE /api/blog/:id
  if (id !== null && parts.length === 2 && method === 'DELETE') {
    await exclusive(async () => {
      const posts = await loadList<BlogPost>(BLOG_FILE);
      const [removed] = posts.splice(findPost(posts), 1);
      await saveJson(BLOG_FILE, posts);
      if (removed.cover) await removeImageFile(removed.cover);
    });
    send(res, 200, { ok: true });
    return true;
  }

  throw new HttpError(405, 'Method not allowed');
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  // GET /api/health
  if (parts[0] === 'health' && method === 'GET') return send(res, 200, { ok: true });

  // GET /api/fetch-image?url=...  (lets the browser grab remote images without CORS trouble)
  if (parts[0] === 'fetch-image' && method === 'GET') {
    const target = url.searchParams.get('url') ?? '';
    if (!/^https?:\/\//i.test(target)) throw new HttpError(400, 'Expected an http(s) URL');
    const r = await fetch(target, { headers: { 'User-Agent': 'game-collection/1.0 (personal cover fetcher)' } });
    if (!r.ok) throw new HttpError(502, `Image request failed: HTTP ${r.status}`);
    const type = (r.headers.get('content-type') ?? '').split(';')[0];
    if (!type.startsWith('image/')) throw new HttpError(415, `Not an image (${type || 'unknown type'})`);
    res.setHeader('Content-Type', type);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }

  if (await handleAwards(parts, method, req, res)) return;
  if (await handleGallery(parts, method, req, res)) return;
  if (await handleCollections(parts, method, req, res)) return;
  if (await handleVinyl(parts, method, req, res)) return;
  if (await handleConsoles(parts, method, req, res)) return;
  if (await handleBlog(parts, method, req, res)) return;
  if (parts[0] !== 'games') throw new HttpError(404, 'Not found');
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');

  // POST /api/games
  if (id === null && method === 'POST') {
    const body = await readBody(req);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const created: Game = { id: Math.max(0, ...games.map((g) => g.id)) + 1, ...sanitize(body), images: [], cover: null };
      games.push(created);
      await saveGames(games);
      return created;
    });
    return send(res, 201, game);
  }

  if (id === null) throw new HttpError(405, 'Method not allowed');

  // PUT /api/games/:id
  if (parts.length === 2 && method === 'PUT') {
    const body = await readBody(req);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      games[i] = { id, ...sanitize(body), images: games[i].images, cover: games[i].cover };
      await saveGames(games);
      return games[i];
    });
    return send(res, 200, game);
  }

  // DELETE /api/games/:id
  if (parts.length === 2 && method === 'DELETE') {
    await exclusive(async () => {
      const games = await loadGames();
      const [removed] = games.splice(findIndex(games, id), 1);
      await saveGames(games);
      await removeUnusedGameImages(removed.images, games);
    });
    return send(res, 200, { ok: true });
  }

  // POST /api/games/:id/images   body: { dataUrl: "data:image/jpeg;base64,..." }
  // The first image a game gets becomes its cover.
  if (parts[2] === 'images' && parts.length === 3 && method === 'POST') {
    const { dataUrl } = await readBody(req);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      const g = games[i];
      const file = await saveUpload(dataUrl, String(id));
      if (!g.images.includes(file)) {
        games[i] = { ...g, images: [...g.images, file], cover: g.cover ?? file };
        await saveGames(games);
      }
      return games[i];
    });
    return send(res, 200, game);
  }

  // DELETE /api/games/:id/images/:file   (a removed cover passes to the next image)
  if (parts[2] === 'images' && parts.length === 4 && method === 'DELETE') {
    const file = decodeURIComponent(parts[3]);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      const g = games[i];
      if (!g.images.includes(file)) throw new HttpError(404, `Image ${file} not found`);
      const images = g.images.filter((f) => f !== file);
      games[i] = { ...g, images, cover: g.cover === file ? (images[0] ?? null) : g.cover };
      await saveGames(games);
      await removeUnusedGameImages([file], games);
      return games[i];
    });
    return send(res, 200, game);
  }

  // PUT /api/games/:id/cover   body: { file: "<one of the game's images>" }
  if (parts[2] === 'cover' && method === 'PUT') {
    const { file } = await readBody(req);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      if (!games[i].images.includes(file)) throw new HttpError(400, 'Cover must be one of the game\'s images');
      games[i] = { ...games[i], cover: file };
      await saveGames(games);
      return games[i];
    });
    return send(res, 200, game);
  }

  throw new HttpError(405, 'Method not allowed');
}

export function collectionApi(): Plugin {
  return {
    name: 'collection-api',
    apply: 'serve',
    configureServer(server) {
      // Vite only serves public files it saw at startup (or via its watcher, which skips
      // these folders), so serve data files and images straight from disk. That way new
      // images and re-imported data show up without restarting the server.
      for (const [mount, dir] of [
        ['/images', IMAGES_DIR],
        ['/data', path.dirname(GAMES_FILE)],
      ] as const) {
        server.middlewares.use(mount, (req, res, next) => {
          const file = path.join(dir, path.basename(decodeURIComponent((req.url ?? '').split('?')[0])));
          readFile(file).then(
            (bytes) => {
              res.setHeader('Content-Type', MIME_BY_EXT[path.extname(file).slice(1)] ?? 'application/octet-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(bytes);
            },
            () => next(),
          );
        });
      }
      server.middlewares.use('/api', (req, res) => {
        // Connect strips the mount path; restore it for the router.
        req.url = `/api${req.url ?? ''}`;
        handle(req, res).catch((err) => {
          const status = err instanceof HttpError ? err.status : 500;
          if (status === 500) server.config.logger.error(String(err?.stack ?? err));
          send(res, status, { error: err instanceof Error ? err.message : String(err) });
        });
      });
    },
  };
}
