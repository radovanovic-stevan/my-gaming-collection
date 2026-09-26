// Local-only editing API, mounted on the Vite dev server (`npm run dev`).
// Everything is persisted straight to the file system:
//   public/data/games.json  - the collection
//   public/images/          - game images, named <id>-<hash>.<ext>
//   public/data/gotm.json   - Game of the Month, one entry per month
//   public/data/gotc.json   - Game of the Category: yearly awards and all-time top 5s
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

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const nullableStr = (v: unknown) => str(v) || null;
const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : []);
function num(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a number`);
  return n;
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
type GotcData = { about: string; allTime: { category: string; ranking: AwardValue[] }[]; years: GotcYear[] };

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
  const mentions = str(s.honorableMentions);
  if (mentions) stats.honorableMentions = mentions;
  const changes = (Array.isArray(s.ratingChanges) ? s.ratingChanges : [])
    .map((r) => ({ title: str(obj(r).title), from: num(obj(r).from, 'Rating from'), to: num(obj(r).to, 'Rating to') }))
    .filter((r) => r.title && r.from !== null && r.to !== null);
  if (changes.length) stats.ratingChanges = changes;
  return { year, awards, stats };
}

function sanitizeAllTime(input: unknown): GotcData['allTime'] {
  if (!Array.isArray(input)) throw new HttpError(400, 'Expected a list of categories');
  return input
    .map((c) => ({
      category: str(obj(c).category),
      ranking: (Array.isArray(obj(c).ranking) ? (obj(c).ranking as unknown[]) : []).map(awardValue).filter((v): v is AwardValue => v !== null),
    }))
    .filter((c) => c.category);
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

  // PUT /api/gotc/all-time   body: { allTime: [...] }
  if (parts[0] === 'gotc' && parts[1] === 'all-time' && parts.length === 2 && method === 'PUT') {
    const allTime = sanitizeAllTime((await readBody(req)).allTime);
    await exclusive(async () => {
      const data = await loadJson<GotcData>(GOTC_FILE);
      await saveJson(GOTC_FILE, { ...data, allTime });
    });
    send(res, 200, allTime);
    return true;
  }

  if (parts[0] === 'gotm' || parts[0] === 'gotc') throw new HttpError(405, 'Method not allowed');
  return false;
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
      await Promise.all(removed.images.map(removeImageFile));
    });
    return send(res, 200, { ok: true });
  }

  // POST /api/games/:id/images   body: { dataUrl: "data:image/jpeg;base64,..." }
  // The first image a game gets becomes its cover.
  if (parts[2] === 'images' && parts.length === 3 && method === 'POST') {
    const { dataUrl } = await readBody(req);
    const m = typeof dataUrl === 'string' && dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m || !IMAGE_TYPES[m[1]]) throw new HttpError(400, 'Expected a JPEG, PNG, WebP or GIF data URL');
    const bytes = Buffer.from(m[2], 'base64');
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    const file = `${id}-${hash}.${IMAGE_TYPES[m[1]]}`;
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      const g = games[i];
      if (!g.images.includes(file)) {
        await writeFile(path.join(IMAGES_DIR, file), bytes);
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
      await removeImageFile(file);
      games[i] = { ...g, images, cover: g.cover === file ? (images[0] ?? null) : g.cover };
      await saveGames(games);
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
