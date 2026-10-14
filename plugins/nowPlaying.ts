// Build step: writes dist/now-playing.svg, a card with the game being played, for the repo's README.
// It's worked out from the data at build time, so it changes with every deploy:
//   1. the launcher game played most recently, if that was in the last week (with its play time);
//   2. else a game in progress in the latest Game of the Month;
//   3. else the latest Game of the Month, shown as such.
// The cover is embedded: an SVG shown as an image can't load other files.
import type { Plugin } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CastingADream, Game, GameRef, GotmMonth } from '../src/types';
import { matchLauncherGames } from '../src/lib/castingADream';
import { createLinker } from '../src/lib/links';
import { band } from '../src/lib/bands';
import { formatPlaytime } from '../src/lib/format';

const RECENT_DAYS = 7;
const SITE = 'collection.stevan.co.rs';

interface Pick {
  heading: string;
  ref: GameRef;
  game: Game | null;
  detail: string;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const day = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00`));
const month = (yyyyMm: string) => monthFmt.format(new Date(`${yyyyMm}-01T00:00:00`));

function pick(games: Game[], months: GotmMonth[], launcher: CastingADream | null, today: Date): Pick | null {
  if (launcher) {
    const since = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const matched = matchLauncherGames(launcher, games);
    const recent = launcher.games.filter((g) => g.lastPlayed && g.lastPlayed >= since).sort((a, b) => b.lastPlayed!.localeCompare(a.lastPlayed!))[0];
    if (recent) {
      const game = matched.get(recent) ?? null;
      const played = recent.minutes ? `${formatPlaytime(recent.minutes)} played · ` : '';
      return { heading: 'Now playing', ref: { title: game?.title ?? recent.title, platform: recent.platform }, game, detail: `${played}last played ${day(recent.lastPlayed!)}` };
    }
  }
  const link = createLinker(games);
  const sorted = [...months].sort((a, b) => b.month.localeCompare(a.month));
  const latest = sorted[0];
  const playing = latest && [latest.gameOfTheMonth, ...latest.played].find((p) => p?.status === 'in-progress');
  if (playing) return { heading: 'Now playing', ref: playing, game: link(playing), detail: `In progress · ${month(latest.month)}` };
  const last = sorted.find((m) => m.gameOfTheMonth);
  if (last) return { heading: 'Last Game of the Month', ref: last.gameOfTheMonth!, game: link(last.gameOfTheMonth!), detail: month(last.month) };
  return null;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Splits a title into at most two lines of about `width` characters, with an ellipsis if it's longer. */
function lines(title: string, width = 30): string[] {
  const out = [''];
  for (const word of title.split(' ')) {
    const line = out[out.length - 1];
    if (!line || line.length + 1 + word.length <= width) out[out.length - 1] = line ? `${line} ${word}` : word;
    else out.push(word);
  }
  if (out.length <= 2) return out;
  const second = `${out[1]} ${out.slice(2).join(' ')}`;
  return [out[0], `${second.slice(0, width - 1).trimEnd()}…`];
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function card(p: Pick, imagesDir: string): string {
  const [bandColor, labelColor, label] = band(p.ref.platform);
  const file = p.game?.cover ? path.join(imagesDir, p.game.cover) : null;
  const cover =
    file && existsSync(file)
      ? `<image href="data:${MIME[path.extname(file).toLowerCase()] ?? 'image/jpeg'};base64,${readFileSync(file).toString('base64')}" x="16" y="16" width="90" height="120" preserveAspectRatio="xMidYMid slice" clip-path="url(#cover)"/>`
      : `<rect x="16" y="16" width="90" height="120" rx="6" fill="${bandColor}"/>`;
  const title = lines(p.ref.title);
  const titleY = title.length === 1 ? 72 : 62;
  const badgeY = titleY + (title.length - 1) * 23 + 16;
  const badgeW = label.length * 7 + 14;
  const font = `font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="152" viewBox="0 0 480 152" role="img" aria-label="${escape(`${p.heading}: ${p.ref.title} (${p.ref.platform})`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22203a"/><stop offset="1" stop-color="#121218"/></linearGradient>
    <clipPath id="cover"><rect x="16" y="16" width="90" height="120" rx="6"/></clipPath>
  </defs>
  <rect width="480" height="152" rx="14" fill="url(#bg)"/>
  ${cover}
  <g ${font}>
    <circle cx="129" cy="33" r="4" fill="${p.heading === 'Now playing' ? '#3ddc84' : '#d4a72c'}"/>
    <text x="140" y="37" font-size="11" font-weight="700" letter-spacing="1.5" fill="#a19fb0">${escape(p.heading.toUpperCase())}</text>
    ${title.map((l, i) => `<text x="124" y="${titleY + i * 23}" font-size="19" font-weight="700" fill="#ffffff">${escape(l)}</text>`).join('\n    ')}
    <rect x="124" y="${badgeY}" width="${badgeW}" height="18" rx="4" fill="${bandColor}"/>
    <text x="${124 + badgeW / 2}" y="${badgeY + 13}" font-size="10" font-weight="800" text-anchor="middle" fill="${labelColor}">${escape(label)}</text>
    <text x="${124 + badgeW + 8}" y="${badgeY + 13}" font-size="12" fill="#c4c2ce">${escape(p.detail)}</text>
    <text x="124" y="134" font-size="11" fill="#77758a">${SITE}</text>
  </g>
</svg>
`;
}

export function nowPlaying(): Plugin {
  let outDir = '';
  return {
    name: 'now-playing',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const read = <T>(file: string): T | null => {
        const full = path.join(outDir, 'data', file);
        return existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : null;
      };
      const chosen = pick(read<Game[]>('games.json') ?? [], read<GotmMonth[]>('gotm.json') ?? [], read<CastingADream>('casting-a-dream.json'), new Date());
      if (!chosen) return;
      writeFileSync(path.join(outDir, 'now-playing.svg'), card(chosen, path.join(outDir, 'images')));
    },
  };
}
