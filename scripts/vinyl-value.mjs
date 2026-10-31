// What the vinyl collection is worth, from the cheapest copy of each record on sale at Discogs.
//
//   node scripts/vinyl-value.mjs              # price every record, write private/vinyl-value.json
//   node scripts/vinyl-value.mjs --dry        # print the result without writing the file
//
// The output stays in private/, which is gitignored: this repo is public and the site is deployed from
// public/, so a valuation must not be written into either. It is for the owner's own net-worth notes.
// Each record is priced by its `discogsId`, the exact pressing on the shelf: a search can't tell one pressing
// from another, and they aren't worth the same. Records without an id are listed as missing and priced at
// nothing. Prices come from the marketplace stats endpoint, which quotes EUR directly, and EUR 1 is added per
// record. It is the cheapest copy listed today, not what copies sell for: Discogs keeps the median behind an
// account, so this total is a floor. Pass --detail to also record which pressing was priced.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const VINYL_FILE = 'public/data/vinyl.json';
const OUT_FILE = 'private/vinyl-value.json';
const DISCOGS = 'https://api.discogs.com';

const HEADERS = { 'User-Agent': 'game-collection/1.0 (personal vinyl valuation)' };
/** Unauthenticated Discogs allows 25 calls a minute; stay under it. */
const GAP_MS = 2600;
/** Added to every record, priced or not. */
const PER_RECORD_EUR = 1;

const dry = process.argv.includes('--dry');
const detail = process.argv.includes('--detail');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 100) / 100;

let last = 0;
/** fetch() that spaces calls out and waits when Discogs says to slow down. */
async function politeFetch(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 429 && attempt < 5) {
      await sleep(Number(r.headers.get('retry-after') ?? 60) * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
}

const vinyl = JSON.parse(readFileSync(VINYL_FILE, 'utf8'));
const pinned = vinyl.filter((r) => r.discogsId);
if (!pinned.length) {
  console.log(`None of the ${vinyl.length} records has a Discogs release yet — add one in the app and run this again.`);
  process.exit(0);
}

console.log(`${pinned.length} of ${vinyl.length} records pinned · prices in EUR from Discogs\n`);

const records = [];
for (const record of vinyl) {
  const name = `${record.artist} — ${record.title}`;
  const row = { id: record.id, artist: record.artist, title: record.title, release: null, forSale: 0, lowestEur: null, valueEur: PER_RECORD_EUR };
  if (!record.discogsId) {
    records.push(row);
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} no Discogs release set`);
    continue;
  }
  try {
    const stats = await politeFetch(`${DISCOGS}/marketplace/stats/${record.discogsId}?curr_abbr=EUR`);
    row.forSale = stats.num_for_sale ?? 0;
    row.lowestEur = typeof stats.lowest_price?.value === 'number' ? round(stats.lowest_price.value) : null;
    row.valueEur = round((row.lowestEur ?? 0) + PER_RECORD_EUR);
    row.release = { id: record.discogsId, url: `https://www.discogs.com/release/${record.discogsId}` };
    if (detail) {
      const release = await politeFetch(`${DISCOGS}/releases/${record.discogsId}`);
      Object.assign(row.release, {
        year: release.year || null,
        country: release.country ?? null,
        label: release.labels?.[0]?.name ?? null,
        catno: release.labels?.[0]?.catno ?? null,
      });
    }
    const line = row.lowestEur === null ? `no copy for sale` : `€${row.lowestEur.toFixed(2)} + €${PER_RECORD_EUR}`;
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} ${line}`);
  } catch (e) {
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} ! ${e.message}`);
  }
  records.push(row);
}

const priced = records.filter((r) => r.lowestEur !== null);
const lowest = round(priced.reduce((s, r) => s + r.lowestEur, 0));
const result = {
  generated: new Date().toISOString().slice(0, 10),
  method: `Lowest Discogs listing in EUR for each record's own pressing, plus EUR ${PER_RECORD_EUR} a record.`,
  source: 'Discogs marketplace stats, curr_abbr=EUR',
  perRecordEur: PER_RECORD_EUR,
  totals: {
    records: vinyl.length,
    pinned: pinned.length,
    priced: priced.length,
    lowestEur: lowest,
    addedEur: vinyl.length * PER_RECORD_EUR,
    totalEur: round(lowest + vinyl.length * PER_RECORD_EUR),
  },
  records,
};

console.log(
  `\n${priced.length} of ${vinyl.length} priced · €${lowest.toFixed(2)} + €${result.totals.addedEur} = €${result.totals.totalEur.toFixed(2)}`,
);
// The one line worth copying into the net-worth notes.
console.log(`\nVinyl · ${vinyl.length} records · €${result.totals.totalEur.toFixed(2)} · ${result.generated}`);
if (dry) console.log('\n--dry: nothing written');
else {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`\nwritten to ${OUT_FILE} (gitignored, never deployed)`);
}
