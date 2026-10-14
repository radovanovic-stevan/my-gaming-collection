// Build step: writes the README's cards into dist/cards/, worked out from the data on every build:
//   now-playing.svg         the launcher game played in the last week, else a Game of the Month game in progress,
//                           else the latest Game of the Month
//   latest-vinyl.svg        the record bought last
//   recently-purchased.svg  the six games bought last
//   recently-completed.svg  the three games completed last
//   recently-listened.svg   the three records listened to last
//   totals.svg              games, consoles and records
// Pictures are embedded (an SVG shown as an image can't load other files), scaled down with sharp but
// otherwise as photographed. Cards that sit next to each other in the README have the same height.
import type { Plugin } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { CastingADream, Game, GameConsole, GameRef, GotmMonth, Vinyl } from '../src/types';
import { matchLauncherGames } from '../src/lib/castingADream';
import { createLinker } from '../src/lib/links';
import { band } from '../src/lib/bands';
import { formatPlaytime, ratingTier } from '../src/lib/format';

const W = 480;
const SITE = 'collection.stevan.co.rs';
const RECENT_DAYS = 7;
const FONT = `font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"`;
const GAME_DOT = '#3ddc84';
const VINYL_DOT = '#f0a43a';
/** Rating badge colours, as on the site in dark mode. */
const TIER: Record<string, string> = { top: '#3ddc84', great: '#9bd34a', good: '#f0bd3a', meh: '#f0845a', none: '#4a4a52' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const day = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00`));
const month = (yyyyMm: string) => monthFmt.format(new Date(`${yyyyMm}-01T00:00:00`));
const num = (n: number) => n.toLocaleString('en-GB');

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fit = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Splits text into at most `max` lines of about `width` characters; the last one ends in … if it's cut. */
function wrap(text: string, width: number, max = 2): string[] {
  const out = [''];
  for (const word of text.split(' ')) {
    const line = out[out.length - 1];
    if (!line || line.length + 1 + word.length <= width) out[out.length - 1] = line ? `${line} ${word}` : word;
    else out.push(word);
  }
  if (out.length <= max) return out;
  return [...out.slice(0, max - 1), fit(out.slice(max - 1).join(' '), width)];
}

// --- Pieces ----------------------------------------------------------------------------------------

/** A picture scaled to fit the box at twice its size (for sharp screens), embedded, with rounded corners. */
async function picture(file: string | null, x: number, y: number, w: number, h: number, fallback: string, id: string): Promise<string> {
  const clip = `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/></clipPath>`;
  if (!file || !existsSync(file)) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fallback}"/>`;
  const jpeg = await sharp(file).resize(w * 2, h * 2, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
  return `<defs>${clip}</defs><image href="data:image/jpeg;base64,${jpeg.toString('base64')}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
}

function platformBadge(platform: string, x: number, y: number): { svg: string; width: number } {
  const [bg, fg, label] = band(platform);
  const width = label.length * 7 + 12;
  return {
    width,
    svg: `<rect x="${x}" y="${y}" width="${width}" height="17" rx="4" fill="${bg}"/><text x="${x + width / 2}" y="${y + 12.5}" font-size="10" font-weight="800" text-anchor="middle" fill="${fg}">${escape(label)}</text>`,
  };
}

function ratingBadge(rating: number | null, x: number, y: number): { svg: string; width: number } {
  if (rating === null) return { svg: '', width: 0 };
  const text = String(rating);
  const width = text.length * 7 + 12;
  return {
    width,
    svg: `<rect x="${x}" y="${y}" width="${width}" height="17" rx="4" fill="${TIER[ratingTier(rating)]}"/><text x="${x + width / 2}" y="${y + 12.5}" font-size="10.5" font-weight="800" text-anchor="middle" fill="#111111">${text}</text>`,
  };
}

/** The card around the content: background, heading with a coloured dot, and the site at the bottom. */
function frame(heading: string, dot: string, height: number, body: string, headingX = 16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escape(heading)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22203a"/><stop offset="1" stop-color="#121218"/></linearGradient></defs>
  <rect width="${W}" height="${height}" rx="14" fill="url(#bg)"/>
  <g ${FONT}>
    <circle cx="${headingX + 5}" cy="33" r="4" fill="${dot}"/>
    <text x="${headingX + 16}" y="37" font-size="11" font-weight="700" letter-spacing="1.5" fill="#a19fb0">${escape(heading.toUpperCase())}</text>
    ${body}
    <text x="${headingX}" y="${height - 16}" font-size="11" fill="#77758a">${SITE}</text>
  </g>
</svg>
`;
}

/** One game in a list: cover, title, platform and rating badges, and a line of detail. */
async function gameRow(game: Game, x: number, y: number, width: number, detail: string, withRating: boolean, id: string): Promise<string> {
  const textX = x + 66;
  const chars = Math.floor((width - 66) / 7.6);
  const title = wrap(game.title, chars);
  const badgeY = y + 14 + title.length * 17;
  const platform = platformBadge(game.platform, textX, badgeY);
  const rating = withRating ? ratingBadge(game.rating, textX + platform.width + 6, badgeY) : { svg: '', width: 0 };
  const detailX = textX + platform.width + (rating.width ? rating.width + 6 : 0) + 8;
  return [
    await picture(game.cover ? path.join(IMAGES, game.cover) : null, x, y, 54, 72, band(game.platform)[0], id),
    ...title.map((l, i) => `<text x="${textX}" y="${y + 15 + i * 17}" font-size="13.5" font-weight="700" fill="#ffffff">${escape(l)}</text>`),
    platform.svg,
    rating.svg,
    `<text x="${detailX}" y="${badgeY + 12.5}" font-size="11.5" fill="#c4c2ce">${escape(detail)}</text>`,
  ].join('\n    ');
}

let IMAGES = '';

// --- The cards ---------------------------------------------------------------------------------------

/**
 * The two cards on the top row, side by side: a picture, the title (up to two lines), and under it a lead
 * (a platform badge, or a record's artist) with the detail beside it.
 */
async function feature(heading: string, dot: string, file: string | null, fallback: string, title: string, lead: (y: number) => { svg: string; width: number }, detail: string): Promise<string> {
  const lines = wrap(title, 30);
  const titleY = lines.length === 1 ? 72 : 62;
  const leadY = titleY + (lines.length - 1) * 23 + 16;
  const { svg, width } = lead(leadY);
  const body = [
    await picture(file, 16, 16, 90, 120, fallback, 'p'),
    ...lines.map((l, i) => `<text x="124" y="${titleY + i * 23}" font-size="19" font-weight="700" fill="#ffffff">${escape(l)}</text>`),
    svg,
    detail && `<text x="${124 + width + 8}" y="${leadY + 12.5}" font-size="12" fill="#c4c2ce">${escape(detail)}</text>`,
  ].join('\n    ');
  return frame(heading, dot, 152, body, 124);
}

async function nowPlaying(games: Game[], months: GotmMonth[], launcher: CastingADream | null, today: Date): Promise<string | null> {
  let heading = 'Now playing';
  let ref: GameRef | null = null;
  let game: Game | null = null;
  let detail = '';
  if (launcher) {
    const since = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const recent = launcher.games.filter((g) => g.lastPlayed && g.lastPlayed >= since).sort((a, b) => b.lastPlayed!.localeCompare(a.lastPlayed!))[0];
    if (recent) {
      game = matchLauncherGames(launcher, games).get(recent) ?? null;
      ref = { title: game?.title ?? recent.title, platform: recent.platform };
      detail = `${recent.minutes ? `${formatPlaytime(recent.minutes)} played · ` : ''}last played ${day(recent.lastPlayed!)}`;
    }
  }
  if (!ref) {
    const link = createLinker(games);
    const sorted = [...months].sort((a, b) => b.month.localeCompare(a.month));
    const playing = sorted[0] && [sorted[0].gameOfTheMonth, ...sorted[0].played].find((p) => p?.status === 'in-progress');
    const last = sorted.find((m) => m.gameOfTheMonth);
    if (playing) [ref, detail] = [playing, `In progress · ${month(sorted[0].month)}`];
    else if (last) [heading, ref, detail] = ['Last Game of the Month', last.gameOfTheMonth!, month(last.month)];
    if (ref) game = link(ref);
  }
  if (!ref) return null;
  const platform = ref.platform;
  return feature(heading, heading === 'Now playing' ? GAME_DOT : '#d4a72c', game?.cover ? path.join(IMAGES, game.cover) : null, band(platform)[0], ref.title, (y) => platformBadge(platform, 124, y), detail);
}

async function latestVinyl(records: Vinyl[]): Promise<string | null> {
  const record = records.filter((r) => r.acquired && ISO.test(r.acquired)).sort((a, b) => b.acquired!.localeCompare(a.acquired!) || b.id - a.id)[0];
  if (!record) return null;
  // The artist and the date share one line of text, so the date follows the name however wide it is.
  const lead = (y: number) => ({
    width: 0,
    svg: `<text x="124" y="${y + 12.5}"><tspan font-size="14" font-weight="600" fill="#e2e0ea">${escape(fit(record.artist, 26))}</tspan><tspan font-size="12" fill="#c4c2ce"> · Bought ${escape(day(record.acquired!))}</tspan></text>`,
  });
  return feature('Latest vinyl', VINYL_DOT, record.cover ? path.join(IMAGES, record.cover) : null, '#3a2d1c', record.title, lead, '');
}

const ROW = 84;
const LIST_TOP = 54;
const LIST_HEIGHT = LIST_TOP + 3 * ROW + 36;

async function recentlyPurchased(games: Game[]): Promise<string> {
  const latest = games.filter((g) => g.acquired && ISO.test(g.acquired)).sort((a, b) => b.acquired!.localeCompare(a.acquired!) || b.id - a.id).slice(0, 6);
  const rows = await Promise.all(latest.map((g, i) => gameRow(g, 16 + (i % 2) * 228, LIST_TOP + Math.floor(i / 2) * ROW, 220, day(g.acquired!).replace(/ \d{4}$/, ''), false, `b${i}`)));
  return frame('Recently purchased', GAME_DOT, LIST_HEIGHT, rows.join('\n    '));
}

async function recentlyCompleted(games: Game[]): Promise<string> {
  const latest = games.filter((g) => g.completed && ISO.test(g.completed)).sort((a, b) => b.completed!.localeCompare(a.completed!) || b.id - a.id).slice(0, 3);
  const rows = await Promise.all(latest.map((g, i) => gameRow(g, 16, LIST_TOP + i * ROW, W - 32, `Completed ${day(g.completed!)}`, true, `c${i}`)));
  return frame('Recently completed', GAME_DOT, LIST_HEIGHT, rows.join('\n    '));
}

const SHELF_HEIGHT = 286;

async function recentlyListened(records: Vinyl[]): Promise<string> {
  const latest = records
    .flatMap((r) => {
      const dates = r.listens.map((l) => l.date).filter((d): d is string => !!d && ISO.test(d));
      if (!dates.length) return [];
      const last = dates.reduce((a, b) => (a > b ? a : b));
      return [{ r, last, sides: r.listens.filter((l) => l.date === last).map((l) => l.side) }];
    })
    .sort((a, b) => b.last.localeCompare(a.last) || b.r.id - a.r.id)
    .slice(0, 3);
  const col = (W - 32) / 3;
  const parts = await Promise.all(
    latest.map(async ({ r, last, sides }, i) => {
      const cx = 16 + i * col + col / 2;
      const sideText = `${sides.length === 1 ? 'Side' : 'Sides'} ${sides.join(', ')}`;
      return [
        await picture(r.cover ? path.join(IMAGES, r.cover) : null, cx - 48, 54, 96, 128, '#3a2d1c', `l${i}`),
        `<text x="${cx}" y="204" font-size="13" font-weight="700" text-anchor="middle" fill="#ffffff">${escape(fit(r.title, 19))}</text>`,
        `<text x="${cx}" y="221" font-size="12" text-anchor="middle" fill="#e2e0ea">${escape(fit(r.artist, 21))}</text>`,
        `<text x="${cx}" y="239" font-size="11" text-anchor="middle" fill="#a19fb0">${escape(`${day(last).replace(/ \d{4}$/, '')} · ${sideText}`)}</text>`,
      ].join('\n    ');
    }),
  );
  return frame('Recently listened', VINYL_DOT, SHELF_HEIGHT, parts.join('\n    '));
}

function totals(games: Game[], consoles: GameConsole[], records: Vinyl[]): string {
  const completed = games.filter((g) => g.status === 'Completed').length;
  const tiles: [string, string, string, string][] = [
    [num(games.length), 'games', `${num(completed)} completed · ${new Set(games.map((g) => g.platform)).size} platforms`, GAME_DOT],
    [num(consoles.length), 'consoles', `${new Set(consoles.map((c) => c.maker)).size} makers`, '#8f84ff'],
    [num(records.length), 'records', `${num(records.reduce((n, r) => n + r.listens.length, 0))} sides played`, VINYL_DOT],
  ];
  const body = tiles
    .map(([value, label, sub, color], i) => {
      const y = 54 + i * 70;
      return [
        `<rect x="16" y="${y}" width="${W - 32}" height="62" rx="10" fill="#ffffff" fill-opacity="0.06"/>`,
        `<rect x="16" y="${y}" width="4" height="62" rx="2" fill="${color}"/>`,
        `<text x="36" y="${y + 41}" font-size="30" font-weight="800" fill="#ffffff">${value}</text>`,
        `<text x="${36 + value.length * 18 + 10}" y="${y + 28}" font-size="14" font-weight="700" fill="#e2e0ea">${label}</text>`,
        `<text x="${36 + value.length * 18 + 10}" y="${y + 46}" font-size="12" fill="#a19fb0">${escape(sub)}</text>`,
      ].join('\n    ');
    })
    .join('\n    ');
  return frame('The collection', '#8f84ff', SHELF_HEIGHT, body);
}

export function readmeCards(): Plugin {
  let outDir = '';
  return {
    name: 'readme-cards',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const read = <T>(file: string, empty: T): T => {
        const full = path.join(outDir, 'data', file);
        return existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : empty;
      };
      IMAGES = path.join(outDir, 'images');
      const games = read<Game[]>('games.json', []);
      const records = read<Vinyl[]>('vinyl.json', []);
      const cards: [string, string | null][] = [
        ['now-playing', await nowPlaying(games, read<GotmMonth[]>('gotm.json', []), read<CastingADream | null>('casting-a-dream.json', null), new Date())],
        ['latest-vinyl', await latestVinyl(records)],
        ['recently-purchased', await recentlyPurchased(games)],
        ['recently-completed', await recentlyCompleted(games)],
        ['recently-listened', await recentlyListened(records)],
        ['totals', totals(games, read<GameConsole[]>('consoles.json', []), records)],
      ];
      mkdirSync(path.join(outDir, 'cards'), { recursive: true });
      for (const [name, svg] of cards) if (svg) writeFileSync(path.join(outDir, 'cards', `${name}.svg`), svg);
      // The first README linked here; keep it working for cached copies.
      if (cards[0][1]) writeFileSync(path.join(outDir, 'now-playing.svg'), cards[0][1]);
    },
  };
}
