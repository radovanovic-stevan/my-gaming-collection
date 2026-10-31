// What the vinyl collection is worth, from the cheapest copy of each record on sale at Discogs.
//
//   node scripts/vinyl-value.mjs              # price every record, write private/vinyl-value.json
//   node scripts/vinyl-value.mjs --dry        # print the result without writing the file
//
// The output stays in private/, which is gitignored: this repo is public and the site is deployed from
// public/, so a valuation must not be written into either. It is for the owner's own net-worth notes.
// Each record is priced by its `discogsId`, the exact pressing on the shelf: a search can't tell one pressing
// from another, and they aren't worth the same. Records without an id are listed as missing and priced at
// nothing. Discogs' open API quotes in USD whatever currency you ask for, so the ECB's daily rate converts it,
// and EUR 1 is added per record. The cheapest listing is not what a copy sells for, so the total is a floor.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const VINYL_FILE = 'public/data/vinyl.json';
const OUT_FILE = 'private/vinyl-value.json';
const DISCOGS = 'https://api.discogs.com';
const RATES = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR';
const HEADERS = { 'User-Agent': 'game-collection/1.0 (personal vinyl valuation)' };
/** Unauthenticated Discogs allows 25 calls a minute; stay under it. */
const GAP_MS = 2600;
/** Added to every record, priced or not. */
const PER_RECORD_EUR = 1;

const dry = process.argv.includes('--dry');
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

async function usdToEur() {
  const r = await fetch(RATES, { headers: HEADERS });
  if (!r.ok) throw new Error(`exchange rate unavailable: ${r.status}`);
  const { date, rates } = await r.json();
  if (!rates?.EUR) throw new Error('exchange rate response had no EUR');
  return { value: rates.EUR, date, from: 'USD', to: 'EUR', source: 'ECB via frankfurter.dev' };
}

const vinyl = JSON.parse(readFileSync(VINYL_FILE, 'utf8'));
const pinned = vinyl.filter((r) => r.discogsId);
if (!pinned.length) {
  console.log(`None of the ${vinyl.length} records has a Discogs release yet — add one in the app and run this again.`);
  process.exit(0);
}

const rate = await usdToEur();
console.log(`${pinned.length} of ${vinyl.length} records pinned · USD→EUR ${rate.value} (${rate.date})\n`);

const records = [];
for (const record of vinyl) {
  const name = `${record.artist} — ${record.title}`;
  if (!record.discogsId) {
    records.push({ id: record.id, artist: record.artist, title: record.title, release: null, forSale: 0, lowestUsd: null, lowestEur: null, valueEur: PER_RECORD_EUR });
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} no Discogs release set`);
    continue;
  }
  let release = null;
  try {
    release = await politeFetch(`${DISCOGS}/releases/${record.discogsId}`);
  } catch (e) {
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} ! ${e.message}`);
  }
  const usd = typeof release?.lowest_price === 'number' ? release.lowest_price : null;
  const lowestEur = usd === null ? null : round(usd * rate.value);
  records.push({
    id: record.id,
    artist: record.artist,
    title: record.title,
    release: release && {
      id: release.id,
      year: release.year || null,
      country: release.country ?? null,
      label: release.labels?.[0]?.name ?? null,
      catno: release.labels?.[0]?.catno ?? null,
      url: `https://www.discogs.com/release/${release.id}`,
    },
    forSale: release?.num_for_sale ?? 0,
    lowestUsd: usd,
    lowestEur,
    valueEur: round((lowestEur ?? 0) + PER_RECORD_EUR),
  });
  if (release) {
    const line = lowestEur === null ? 'no copy for sale' : `€${lowestEur.toFixed(2)} + €${PER_RECORD_EUR}`;
    console.log(`  ${String(record.id).padStart(3)}  ${name.slice(0, 48).padEnd(50)} ${line}`);
  }
}

const priced = records.filter((r) => r.lowestEur !== null);
const lowest = round(priced.reduce((s, r) => s + r.lowestEur, 0));
const result = {
  generated: new Date().toISOString().slice(0, 10),
  method: `Lowest Discogs listing for each record's own pressing, converted to EUR, plus EUR ${PER_RECORD_EUR} a record.`,
  rate,
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
