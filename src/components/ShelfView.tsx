import { useEffect, useState } from 'react';
import type { Game } from '../types';
import { platformHue } from '../lib/format';
import { PlatformBadge, RatingBadge } from './Badges';
import { band } from '../lib/bands';

interface Props {
  /** In display order; each platform keeps this order on its shelf. */
  games: Game[];
  /** The whole collection, which decides which platforms are small enough to share a shelf. */
  all: Game[];
  onOpen: (game: Game) => void;
}

/**
 * How tall each platform's case stands on the shelf, roughly to scale: DVD cases, Blu-ray cases,
 * UMD cases, then the small handheld boxes. Platforms not listed get a medium height.
 */
const CASE_HEIGHT: Record<string, number> = {
  PS2: 190,
  Wii: 190,
  GCN: 190,
  XBOX: 190,
  X360: 190,
  PC: 190,
  PS3: 172,
  PS4: 172,
  PSP: 172,
  Dreamcast: 150,
  PS1: 142,
  VITA: 136,
  NDS: 126,
  '3DS': 126,
  GBA: 126,
};
const DEFAULT_HEIGHT = 150;
const caseHeight = (platform: string) => CASE_HEIGHT[platform] ?? DEFAULT_HEIGHT;

/** Platforms with fewer boxed games than this in the collection share one shelf. */
const SMALL_PLATFORM = 10;

/**
 * Roughly the shape of each console with games built in, as it stands on the shelf (width × height).
 * Game & Watch is a handheld standing upright.
 */
const CONSOLE_SIZE: Record<string, [number, number]> = {
  'Atari FB3': [150, 58],
  'SNES Classic': [118, 46],
  'PS Classic': [108, 40],
  'G&W': [58, 88],
};
const DEFAULT_CONSOLE: [number, number] = [120, 50];

const isBuiltIn = (g: Game) => g.condition.includes('Built-in Console');

const byPlatform = (games: Game[]): [string, Game[]][] => {
  const out = new Map<string, Game[]>();
  for (const g of games) out.set(g.platform, [...(out.get(g.platform) ?? []), g]);
  return [...out].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

/** One shelf: a platform's boxed games, or several small platforms' games side by side. */
interface Shelf {
  key: string;
  /** The platforms on it and how many of their games are shown, in shelf order. */
  platforms: [string, number][];
  games: Game[];
}

/**
 * Boxed games on a shelf per platform, the biggest shelf first, then one shelf shared by the platforms with
 * fewer than SMALL_PLATFORM boxed games in the whole collection (so filtering doesn't move a platform there).
 * Games built into a console are grouped by that console. Each keeps the order the games come in.
 */
export function arrange(games: Game[], all: Game[]): { shelves: Shelf[]; consoles: [string, Game[]][] } {
  const owned = new Map<string, number>();
  for (const g of all) if (!isBuiltIn(g)) owned.set(g.platform, (owned.get(g.platform) ?? 0) + 1);
  const groups = byPlatform(games.filter((g) => !isBuiltIn(g)));
  const isSmall = ([platform]: [string, Game[]]) => (owned.get(platform) ?? 0) < SMALL_PLATFORM;
  const own = (group: [string, Game[]][]): Shelf[] => group.map(([p, gs]) => ({ key: p, platforms: [[p, gs.length]], games: gs }));
  const small = groups.filter(isSmall);
  const shelves = [
    ...own(groups.filter((g) => !isSmall(g))),
    // A small platform shown on its own keeps its own shelf.
    ...(small.length > 1 ? [{ key: 'other', platforms: small.map(([p, gs]): [string, number] => [p, gs.length]), games: small.flatMap(([, gs]) => gs) }] : own(small)),
  ];
  return { shelves, consoles: byPlatform(games.filter(isBuiltIn)) };
}

/** The order the Shelf view shows the games in. */
export function shelfOrder(games: Game[], all: Game[]): Game[] {
  const { shelves, consoles } = arrange(games, all);
  return [...shelves.flatMap((s) => s.games), ...consoles.flatMap(([, gs]) => gs)];
}

/** The game whose card is showing, and the spine it belongs to. */
type Tip = { game: Game; el: HTMLElement } | null;

function Spine({ game, onOpen, onTip }: { game: Game; onOpen: Props['onOpen']; onTip: (tip: Tip) => void }) {
  const [bandColor, labelColor, label] = band(game.platform);
  return (
    <li className="spine-slot">
      <button
        className="spine"
        // Each game gets its own colour from its title; the band on top is the platform's.
        // Its own case height, since a shared shelf holds cases of different sizes.
        style={{ '--band': bandColor, '--band-fg': labelColor, '--spine-h': `${caseHeight(game.platform)}px` } as React.CSSProperties}
        onClick={() => onOpen(game)}
        {...tipHandlers(game, onTip)}
        aria-label={`${game.title}, ${game.platform}`}
      >
        <span className="spine-band" aria-hidden="true">
          {label}
        </span>
        <span className="spine-title" aria-hidden="true">
          {game.title}
        </span>
      </button>
    </li>
  );
}

const tipHandlers = (game: Game, onTip: (tip: Tip) => void) => ({
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && onTip({ game, el: e.currentTarget }),
  onPointerLeave: () => onTip(null),
  onFocus: (e: React.FocusEvent<HTMLElement>) => onTip({ game, el: e.currentTarget }),
  onBlur: () => onTip(null),
});

/** A console with games built in, standing on the shelf. */
function ConsoleBox({ platform, count, open, onToggle }: { platform: string; count: number; open: boolean; onToggle: () => void }) {
  const [w, h] = CONSOLE_SIZE[platform] ?? DEFAULT_CONSOLE;
  return (
    <li className="console-slot">
      <button
        className={`console-box ${open ? 'open' : ''}`}
        style={{ '--hue': platformHue(platform), width: `calc(${w}px * var(--shelf-scale))`, height: `calc(${h}px * var(--shelf-scale))` } as React.CSSProperties}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="console-screen"
        aria-label={`${platform}: ${count} built-in ${count === 1 ? 'game' : 'games'}. ${open ? 'Hide' : 'Show'} them.`}
      >
        <span className="console-name">{platform}</span>
        <span className="console-count">{count}</span>
        <span className="console-lights" aria-hidden="true" />
      </button>
    </li>
  );
}

export function ShelfView({ games, all, onOpen }: Props) {
  const [tip, setTip] = useState<Tip>(null);
  // The card sits above its spine, so it moves along when the page scrolls.
  const [, setScrolled] = useState(0);
  useEffect(() => {
    if (!tip) return;
    const follow = () => setScrolled((n) => n + 1);
    window.addEventListener('scroll', follow, { passive: true });
    return () => window.removeEventListener('scroll', follow);
  }, [tip]);
  const at = tip?.el.getBoundingClientRect();

  const { shelves, consoles } = arrange(games, all);
  // The console picked, '' once one is closed, or null before any is picked.
  const [picked, setPicked] = useState<string | null>(null);
  // With only one console showing and nothing else (say, filtered to SNES Classic), its games are shown right away.
  const open =
    picked !== null && consoles.some(([p]) => p === picked) ? picked : picked === null && !shelves.length && consoles.length === 1 ? consoles[0][0] : null;
  const openGames = consoles.find(([p]) => p === open)?.[1] ?? [];
  const pick = (game: Game) => (setTip(null), onOpen(game));
  const builtInCount = consoles.reduce((n, [, gs]) => n + gs.length, 0);

  return (
    <div className="shelves">
      {shelves.map((shelf) => (
        <section
          key={shelf.key}
          className="shelf"
          // Tall enough for its tallest case.
          style={{ '--case-h': `${Math.max(...shelf.platforms.map(([p]) => caseHeight(p)))}px` } as React.CSSProperties}
          aria-label={shelf.platforms.length > 1 ? 'Other platforms shelf' : `${shelf.key} shelf`}
        >
          <h2 className="shelf-head">
            {shelf.platforms.length > 1 ? 'Other platforms' : <PlatformBadge platform={shelf.key} />}
            <span className="muted">
              {shelf.games.length} {shelf.games.length === 1 ? 'game' : 'games'}
            </span>
            {shelf.platforms.length > 1 &&
              shelf.platforms.map(([p, n]) => (
                <span key={p} className="shelf-head-platform">
                  <PlatformBadge platform={p} /> <span className="muted">{n}</span>
                </span>
              ))}
          </h2>
          <ul className="shelf-rows">
            {shelf.games.map((g) => (
              <Spine key={g.id} game={g} onOpen={pick} onTip={setTip} />
            ))}
          </ul>
        </section>
      ))}

      {consoles.length > 0 && (
        <section className="shelf" style={{ '--case-h': '96px' } as React.CSSProperties} aria-label="Built into consoles">
          <h2 className="shelf-head">
            Built into consoles
            <span className="muted">
              {builtInCount} {builtInCount === 1 ? 'game' : 'games'} · pick a console to see its games
            </span>
          </h2>
          <ul className="shelf-rows console-row">
            {consoles.map(([platform, list]) => (
              <ConsoleBox key={platform} platform={platform} count={list.length} open={open === platform} onToggle={() => setPicked(open === platform ? '' : platform)} />
            ))}
          </ul>
          {open && (
            <div className="console-screen" id="console-screen" style={{ '--hue': platformHue(open) } as React.CSSProperties}>
              <h3>
                {open} <span>· {openGames.length} {openGames.length === 1 ? 'game' : 'games'}</span>
              </h3>
              <ul className="console-games">
                {openGames.map((g) => (
                  <li key={g.id}>
                    <button
                      className="console-game"
                      onClick={() => pick(g)}
                      aria-label={`${g.title}, ${g.platform}`}
                      {...tipHandlers(g, setTip)}
                    >
                      <span className="console-game-title">{g.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tip && at && (
        <div className="shelf-tip" style={{ left: Math.min(Math.max(at.left + at.width / 2, 110), innerWidth - 110), top: at.top }} role="presentation">
          <span className="shelf-tip-text">
            <b>{tip.game.title}</b>
            <span className="shelf-tip-meta">
              <PlatformBadge platform={tip.game.platform} />
              <RatingBadge rating={tip.game.rating} />
            </span>
            <span className={`status status-${tip.game.status.toLowerCase().replace(/\s+/g, '-')}`}>{tip.game.status}</span>
          </span>
        </div>
      )}
    </div>
  );
}
