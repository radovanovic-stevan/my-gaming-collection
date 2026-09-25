// Fetches box art from Wikipedia infoboxes for games that don't have a cover yet.
//
//   node scripts/fetch-covers.mjs              # top 60 rated games without a cover
//   node scripts/fetch-covers.mjs 150          # top 150
//   node scripts/fetch-covers.mjs --ids 280,649
//
// Only accepts an article whose title matches the game's title closely, so
// misses are skipped rather than guessed. Anything wrong can be replaced in the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const GAMES_FILE = 'public/data/games.json';
const API = 'https://en.wikipedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'game-collection/1.0 (personal collection cover fetcher)' };

const args = process.argv.slice(2);
const idsArg = args.includes('--ids') ? args[args.indexOf('--ids') + 1] : null;
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? 60);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch() that backs off and retries when Wikimedia rate-limits us. */
async function politeFetch(url) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.status !== 429 || attempt === 6) return r;
    const wait = Number(r.headers.get('retry-after')) * 1000 || 5000 * attempt;
    console.log(`  rate limited, waiting ${Math.round(wait / 1000)}s…`);
    await sleep(wait);
  }
}

async function wiki(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const r = await politeFetch(url);
  if (!r.ok) throw new Error(`Wikipedia HTTP ${r.status}`);
  return r.json();
}

const words = (s) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

const NUMERAL = /^(\d+|i{1,3}|iv|v|vi{1,3}|ix|x)$/;
const numerals = (ws) => ws.filter((w) => NUMERAL.test(w)).sort().join(' ');

/**
 * True when every word of one title appears in the other and both carry the same
 * sequel numbers: "Fallout 3" matches "Fallout 3 Game of the Year Edition", but
 * "Fallout" does not match "Fallout 4".
 */
function titlesMatch(gameTitle, articleTitle) {
  const a = words(gameTitle);
  const b = words(articleTitle);
  if (!a.length || !b.length || numerals(a) !== numerals(b)) return false;
  return b.every((w) => a.includes(w)) || a.every((w) => b.includes(w));
}

async function findArticle(title) {
  const res = await wiki({ action: 'query', list: 'search', srsearch: `${title} video game`, srlimit: '5' });
  return res.query.search.map((s) => s.title).find((t) => titlesMatch(title, t)) ?? null;
}

async function infoboxImage(article) {
  const res = await wiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: '0', titles: article, redirects: '1' });
  const text = res.query.pages[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  const m = text.match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n<]+?\.(?:jpe?g|png|webp|gif))/i);
  return m ? m[1].trim() : null;
}

async function imageUrl(file) {
  const res = await wiki({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600', titles: `File:${file}` });
  const info = res.query.pages[0]?.imageinfo?.[0];
  return info?.thumburl ?? info?.url ?? null;
}

const games = JSON.parse(readFileSync(GAMES_FILE, 'utf8'));
const byId = new Map(games.map((g) => [g.id, g]));

const targets = idsArg
  ? idsArg.split(',').map((id) => byId.get(Number(id))).filter(Boolean)
  : games
      .filter((g) => !g.cover && g.rating !== null)
      .sort((a, b) => b.rating - a.rating || a.id - b.id)
      .slice(0, limit);

// Several copies of the same game (e.g. two platforms) can share one lookup.
const cache = new Map();
let saved = 0;
const misses = [];

for (const game of targets) {
  try {
    if (!cache.has(game.title)) {
      const article = await findArticle(game.title);
      const file = article && (await infoboxImage(article));
      const url = file && (await imageUrl(file));
      cache.set(game.title, url ? { article, url } : null);
      await sleep(500);
    }
    const hit = cache.get(game.title);
    if (!hit) {
      misses.push(`#${game.id} ${game.title}`);
      continue;
    }
    const r = await politeFetch(hit.url);
    if (!r.ok) throw new Error(`image HTTP ${r.status}`);
    const type = r.headers.get('content-type') ?? '';
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
    const bytes = Buffer.from(await r.arrayBuffer());
    const file = `${game.id}-${createHash('sha1').update(bytes).digest('hex').slice(0, 8)}.${ext}`;
    writeFileSync(`public/images/${file}`, bytes);
    game.images = [...(game.images ?? []), file];
    game.cover = file;
    saved++;
    console.log(`✓ #${game.id} ${game.title}  ←  ${hit.article}`);
    // Persist as we go so an interrupted run keeps its progress.
    writeFileSync(GAMES_FILE, JSON.stringify(games, null, 1) + '\n');
    await sleep(1000);
  } catch (e) {
    misses.push(`#${game.id} ${game.title} (${e.message})`);
  }
}

console.log(`\nSaved ${saved} covers.`);
if (misses.length) console.log(`No cover found for ${misses.length}:\n  ${misses.join('\n  ')}`);
