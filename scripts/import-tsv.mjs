// Converts the spreadsheet export (data/source/*.tsv) into public/data/games.json.
// Existing images and cover assignments in games.json are preserved across re-imports.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = process.argv[2] ?? 'data/source/games-1.5.tsv';
const OUT = 'public/data/games.json';

const STATUSES = ['Completed', 'Not Completed', 'Null', 'Unplayable', 'Unrateable'];

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const isBlank = (s) => s === '' || s === '/';

// dd/mm/yyyy -> yyyy-mm-dd; anything else (e.g. "Late 2013 - Early 2014") is kept verbatim.
function parseDate(raw) {
  const s = clean(raw);
  if (isBlank(s)) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseNumber(raw) {
  const s = clean(raw);
  if (isBlank(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "60:19" or "28:10:00" -> minutes (first two parts are hours:minutes).
function parsePlaytime(raw) {
  const s = clean(raw);
  if (isBlank(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

const splitList = (raw) =>
  clean(raw)
    .split('|')
    .map(clean)
    .filter((x) => !isBlank(x));

const GENRE_FIXES = { Figthing: 'Fighting', Plafformer: 'Platformer', Platform: 'Platformer' };
const normalizeGenre = (g) => GENRE_FIXES[g] ?? g;

function normalizeCondition(c) {
  return /^built-?in( console)?$/i.test(c) ? 'Built-in Console' : c;
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const existingById = new Map(existing.map((g) => [g.id, g]));

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const games = lines.slice(1).map((line) => {
  const c = line.split('\t');
  let status = clean(c[5]);
  let genres = [...new Set(splitList(c[11]).map(normalizeGenre))];

  // Night Driver: genre was entered in the status column.
  if (!STATUSES.includes(status)) {
    if (status && !genres.includes(status)) genres = [status, ...genres];
    status = 'Null';
  }

  let id = Number(clean(c[0]));
  // Typo in the sheet: #930 was entered as a second #931.
  if (id === 931 && clean(c[1]).startsWith('Naruto Shippuden: Ultimate Ninja 5')) id = 930;
  return {
    id,
    title: clean(c[1]),
    platform: clean(c[2]),
    acquired: parseDate(c[3]),
    completed: parseDate(c[4]),
    status,
    rating: parseNumber(c[6]),
    timesCompleted: parseNumber(c[7]),
    percent: parseNumber(c[8]),
    playtime: parsePlaytime(c[9]),
    genres,
    condition: splitList(c[12]).map(normalizeCondition),
    edition: clean(c[13]),
    images: existingById.get(id)?.images ?? [],
    cover: existingById.get(id)?.cover ?? null,
  };
});

const ids = new Set();
for (const g of games) {
  if (!Number.isInteger(g.id)) throw new Error(`Bad id for "${g.title}"`);
  if (ids.has(g.id)) throw new Error(`Duplicate id ${g.id}`);
  ids.add(g.id);
}

games.sort((a, b) => a.id - b.id);
writeFileSync(OUT, JSON.stringify(games, null, 1) + '\n');
console.log(`Wrote ${games.length} games to ${OUT}`);
