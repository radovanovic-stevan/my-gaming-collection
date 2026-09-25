// Local-only editing API, mounted on the Vite dev server (`npm run dev`).
// Everything is persisted straight to the file system:
//   public/data/games.json  - the collection
//   public/covers/          - cover images, named <id>-<hash>.<ext>
// The static build (GitHub Pages) has no API, so the app is read-only there.
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const GAMES_FILE = path.join(ROOT, 'public/data/games.json');
const COVERS_DIR = path.join(ROOT, 'public/covers');

const STATUSES = ['Completed', 'Not Completed', 'Null', 'Unplayable', 'Unrateable'];
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BODY = 15 * 1024 * 1024;

type Game = Record<string, unknown> & { id: number; cover: string | null };

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

async function removeCoverFile(file: string | null) {
  if (!file) return;
  await unlink(path.join(COVERS_DIR, path.basename(file))).catch(() => {});
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
function sanitize(input: Record<string, unknown>): Omit<Game, 'id' | 'cover'> {
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
    note: str(input.note),
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

  if (parts[0] !== 'games') throw new HttpError(404, 'Not found');
  const id = parts[1] === undefined ? null : Number(parts[1]);
  if (id !== null && !Number.isInteger(id)) throw new HttpError(400, 'Invalid id');

  // POST /api/games
  if (id === null && method === 'POST') {
    const body = await readBody(req);
    const game = await exclusive(async () => {
      const games = await loadGames();
      const created: Game = { id: Math.max(0, ...games.map((g) => g.id)) + 1, ...sanitize(body), cover: null };
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
      games[i] = { id, ...sanitize(body), cover: games[i].cover };
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
      await removeCoverFile(removed.cover);
    });
    return send(res, 200, { ok: true });
  }

  // PUT /api/games/:id/cover   body: { dataUrl: "data:image/jpeg;base64,..." }
  if (parts[2] === 'cover' && method === 'PUT') {
    const { dataUrl } = await readBody(req);
    const m = typeof dataUrl === 'string' && dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m || !IMAGE_TYPES[m[1]]) throw new HttpError(400, 'Expected a JPEG, PNG, WebP or GIF data URL');
    const bytes = Buffer.from(m[2], 'base64');
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    const file = `${id}-${hash}.${IMAGE_TYPES[m[1]]}`;
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      await writeFile(path.join(COVERS_DIR, file), bytes);
      if (games[i].cover !== file) await removeCoverFile(games[i].cover);
      games[i] = { ...games[i], cover: file };
      await saveGames(games);
      return games[i];
    });
    return send(res, 200, game);
  }

  // DELETE /api/games/:id/cover
  if (parts[2] === 'cover' && method === 'DELETE') {
    const game = await exclusive(async () => {
      const games = await loadGames();
      const i = findIndex(games, id);
      await removeCoverFile(games[i].cover);
      games[i] = { ...games[i], cover: null };
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
