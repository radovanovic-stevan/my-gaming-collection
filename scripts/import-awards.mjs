// Converts the "Game of the Month" and "Game of the Category" sheet exports into
// public/data/gotm.json and public/data/gotc.json.
//
//   node scripts/import-awards.mjs --force [gotm.tsv] [gotc.tsv]
//
// Once months or years are added in the app, the JSON files are the source of truth,
// so this refuses to overwrite them unless --force is given.
//
// Both sheets are laid out for people, not machines (blocks, merged cells, images),
// so this reads them by their visual structure. Images don't survive a TSV export.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const [GOTM_SRC = 'data/source/gotm-2.0.tsv', GOTC_SRC = 'data/source/gotc-2.0.tsv'] = args.filter((a) => a !== '--force');

const OUTPUTS = ['public/data/gotm.json', 'public/data/gotc.json'];
if (!force && OUTPUTS.some(existsSync)) {
  console.error(
    'gotm.json / gotc.json already exist and may contain entries added in the app.\n' +
      'Re-run with --force to replace them with the sheet exports.',
  );
  process.exit(1);
}

/** Minimal TSV reader that honours quoted cells (which may contain tabs or newlines). */
function readTsv(file) {
  const text = readFileSync(file, 'utf8').replace(/\r/g, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') row.push(cell), (cell = '');
    else if (ch === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
    else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  // U+FE0F is a leftover emoji variation selector that trails many hand-typed titles.
  return rows.map((r) => r.map((c) => c.replace(/\uFE0F/g, '').replace(/\s+/g, ' ').trim()));
}

// The sheets use a few platform spellings that differ from the collection.
const PLATFORM_ALIASES = { SNESc: 'SNES Classic', DS: 'NDS' };
const platform = (p) => PLATFORM_ALIASES[p] ?? p;

// --- Game of the Month ------------------------------------------------------

const STATUS = { '✅': 'completed', '⏳': 'in-progress', '➖': 'played', '✨': 'post-completion' };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_TYPOS = { septebmber: 'september' };

function parseMonth(label) {
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const index = MONTHS.indexOf(MONTH_TYPOS[name] ?? name);
  return index < 0 ? null : `${m[2]}-${String(index + 1).padStart(2, '0')}`;
}

const entry = (title, plat, status) => ({ title, platform: platform(plat), status: STATUS[status] ?? null });

/**
 * Each month is a block: a header row ("July 2026"), one row per game played
 * (columns D–F: title, platform, status), blank rows where the images sit, and a
 * footer (A–E: Game of the Month, platform, status, "Completed: N", "Bought: N").
 * The Game of the Month is not repeated in the list; "Completed" counts both.
 */
function importGotm(file) {
  const months = [];
  let current = null;
  for (const [i, c] of readTsv(file).entries()) {
    const [a = '', b = '', s = '', d = '', e = '', f = ''] = c;
    const month = a && !b && !s && !d && !e && !f ? parseMonth(a) : null;
    if (month) {
      current = { month, gameOfTheMonth: null, completed: null, bought: null, played: [] };
      months.push(current);
    } else if (!a && d) {
      if (!current) throw new Error(`GOTM row ${i + 1}: game before any month header`);
      current.played.push(entry(d, e, f));
    } else if (a && /^Completed:/.test(d)) {
      if (!current) throw new Error(`GOTM row ${i + 1}: footer before any month header`);
      current.gameOfTheMonth = entry(a, b, s);
      current.completed = Number(d.split(':')[1]);
      current.bought = Number(e.split(':')[1]);
    } else if (c.some(Boolean)) {
      throw new Error(`GOTM row ${i + 1}: unrecognised row ${JSON.stringify(c)}`);
    }
  }

  for (const m of months) {
    if (m.completed === null) continue; // the running month has no footer yet
    const counted = [...m.played, m.gameOfTheMonth].filter((g) => g.status === 'completed').length;
    if (counted !== m.completed) console.warn(`⚠ ${m.month}: sheet says ${m.completed} completed, list has ${counted}`);
  }
  return months.sort((x, y) => y.month.localeCompare(x.month));
}

// --- Game of the Category ---------------------------------------------------

/** "Title [Platform]" -> game; other text (a console, a moment) -> text; "/" -> null. */
function award(value) {
  if (!value || value === '/') return null;
  const m = value.match(/^(.*?)\s*\[([^\]]+)\]$/);
  return m ? { title: m[1], platform: platform(m[2]) } : { text: value };
}

const categoryName = (header, year) =>
  header
    .replace(/^Category:\s*/, '')
    .replace(year ? new RegExp(`\\s*${year}\\b`) : /$^/, '')
    .trim();

const STAT_LABELS = {
  'Games Completed': 'gamesCompleted',
  'Games Bought': 'gamesBought',
  'Consoles Bought': 'consolesBought',
  'Multiple GOTM Winners': 'multipleGotmWinners',
  'Moment of the Year Honorable Mentions': 'honorableMentions',
  'Ratings Changes': 'ratingChanges',
};

/** The yearly notes cell lost its line breaks in the export; split it on its known labels. */
function parseStats(text) {
  const stats = {};
  const pattern = new RegExp(`(${Object.keys(STAT_LABELS).join('|')}):`, 'g');
  const parts = text.split(pattern);
  for (let i = 1; i < parts.length; i += 2) {
    const key = STAT_LABELS[parts[i]];
    const value = parts[i + 1].trim();
    if (key === 'gamesCompleted' || key === 'gamesBought') stats[key] = Number(value);
    else if (key === 'consolesBought') stats[key] = value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (key === 'multipleGotmWinners') stats[key] = [...value.matchAll(/(.+?)\s*\[([^\]]+)\]/g)].map((m) => ({ title: m[1].trim(), platform: platform(m[2]) }));
    else if (key === 'ratingChanges')
      stats[key] = [...value.matchAll(/(.+?)\s*\|\s*([\d.]+)\s*->\s*([\d.]+)/g)].map((m) => ({ title: m[1].trim(), from: Number(m[2]), to: Number(m[3]) }));
    else stats[key] = value;
  }
  return stats;
}

/**
 * Layout: an "All-Time Categories" block (skipped: the app works the top 5s out from
 * the collection's ratings), then one "<year> Best-Of" block per year (category names,
 * then a single winner row). Column AY holds the description and yearly notes.
 */
function importGotc(file) {
  const rows = readTsv(file);
  const NOTES_COL = rows[2].findIndex((c) => c === 'What is GOTC?');
  const cell = (r, j) => rows[r]?.[j] ?? '';
  const categoryCols = (r) => rows[r].map((c, j) => (j > 0 && j !== NOTES_COL && c.startsWith('Category:') ? j : -1)).filter((j) => j >= 0);

  const years = [];
  for (const [i, r] of rows.entries()) {
    const m = r[1]?.match(/^(\d{4}) Best-Of$/);
    if (!m) continue;
    const year = Number(m[1]);
    const header = i + 1;
    const winners = header + 2; // a notes-only row sits between names and winners
    years.push({
      year,
      awards: categoryCols(header).map((j) => ({ category: categoryName(cell(header, j), year), winner: award(cell(winners, j)) })),
      stats: parseStats(cell(header + 1, NOTES_COL)),
    });
  }

  return { about: cell(3, NOTES_COL), years: years.sort((a, b) => b.year - a.year) };
}

const gotm = importGotm(GOTM_SRC);
writeFileSync('public/data/gotm.json', JSON.stringify(gotm, null, 1) + '\n');
console.log(`Wrote ${gotm.length} months to public/data/gotm.json`);

const gotc = importGotc(GOTC_SRC);
writeFileSync('public/data/gotc.json', JSON.stringify(gotc, null, 1) + '\n');
console.log(`Wrote ${gotc.years.length} years to public/data/gotc.json`);
