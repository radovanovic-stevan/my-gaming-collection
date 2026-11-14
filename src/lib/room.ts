import type { Game } from '../types';
import { band } from './bands';
import { hasPart } from './format';

/**
 * The owner's wall, shelf by shelf, in metres. The arrangement below is his, read off the photograph:
 * three white Billy bookcases with the height extensions on top, each platform where he actually keeps it.
 */

/** Each platform's case, in millimetres: thickness on the shelf, how tall it stands, how deep it sits. */
const CASE: Record<string, [number, number, number]> = {
  PS2: [14, 190, 135],
  Wii: [14, 190, 135],
  GCN: [14, 190, 135],
  XBOX: [14, 190, 135],
  X360: [14, 190, 135],
  PC: [14, 190, 135],
  PS3: [14, 172, 135],
  PS4: [14, 172, 135],
  PSP: [14, 172, 105],
  Dreamcast: [15, 150, 135],
  PS1: [10, 142, 125],
  VITA: [12, 136, 105],
  NDS: [12, 126, 137],
  '3DS': [12, 126, 137],
  GBA: [20, 126, 92],
};
const DEFAULT_CASE: [number, number, number] = [14, 150, 125];
const caseOf = (platform: string) => CASE[platform] ?? DEFAULT_CASE;

/** A Billy: 80 wide, 28 deep, 202 tall, with the 35cm extension on top. Six compartments and the extension's one. */
export const UNIT = {
  width: 0.8,
  depth: 0.28,
  body: 2.02,
  extension: 0.35,
  panel: 0.018,
  back: 0.008,
  plinth: 0.04,
  compartments: 6,
};
export const UNIT_HEIGHT = UNIT.body + UNIT.extension;
const SHELF = UNIT.width - UNIT.panel * 2;
const INSET = 0.008;
/** Usable width of one shelf. */
const CLEAR = SHELF - INSET * 2;

const ROOM = { depth: 4, height: 2.8 };

const isBuiltIn = (g: Game) => g.condition.includes('Built-in Console');
/**
 * What can stand on a shelf: a box with its cover, of any kind. A bare disc or cartridge, and a case with
 * no artwork at all, goes in the crate at the end of its platform's run instead.
 */
const hasCase = (g: Game) => hasPart(g, 'Box') && hasPart(g, 'Cover');

/**
 * One thing standing on one shelf: a platform's boxes on their spines, or laid flat in a pile, or a box of
 * the loose games. A flat pile can sit on top of another platform's row, the way the two GameCube discs sit
 * on the Wii ones.
 */
type Run =
  | { platform: string; flat?: boolean; onTopOf?: string }
  | { crate: string[] };

const isCrate = (run: Run): run is { crate: string[] } => 'crate' in run;

/**
 * The wall itself: three bookcases, seven shelves each, top shelf first. The leftmost bookcase in the
 * photograph holds books, not games, so it isn't here.
 */
const WALL: Run[][][] = [
  [
    [{ platform: 'PSP' }],
    [{ platform: 'PSP' }],
    [{ platform: 'PSP' }],
    [
      { platform: 'NDS', flat: true },
      { platform: '3DS' },
      { platform: 'Dreamcast' },
      { platform: 'VITA', flat: true },
      { platform: 'Famicom' },
      { crate: ['NDS', '3DS', 'GBA'] },
    ],
    [{ platform: 'Wii' }, { platform: 'GCN', flat: true, onTopOf: 'Wii' }],
    [
      { platform: 'PC', flat: true },
      { platform: 'PS1' },
      { platform: 'XBOX', flat: true, onTopOf: 'PC' },
      { platform: 'X360', flat: true, onTopOf: 'PC' },
    ],
    [],
  ],
  [
    [{ platform: 'PS2' }],
    [{ platform: 'PS2' }],
    [{ platform: 'PS2' }],
    [{ platform: 'PS2' }],
    [{ platform: 'PS2' }],
    [],
    [],
  ],
  [
    [{ platform: 'PS3' }],
    [{ platform: 'PS3' }],
    [{ platform: 'PS3' }],
    [{ platform: 'PS3' }],
    [{ platform: 'PS3' }],
    [{ platform: 'PS4' }],
    [{ platform: 'PS4' }],
  ],
];
/** The consoles with games inside them stand on this shelf: second bookcase, sixth shelf down. */
const CONSOLE_SHELF = { unit: 1, shelf: 5 };

export interface Slot {
  game: Game;
  /** What's on the spine: a game's title, or the name of the box several games share. */
  title: string;
  /** The games inside, when one box holds more than one. */
  bundle?: Game[];
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  /** Lying flat in a pile rather than standing on its spine, so its label reads along the box. */
  flat: boolean;
  unit: number;
  shelf: number;
}

export interface Unit {
  x: number;
  z: number;
  /** Top surface of each shelf board, bottom to top. */
  shelves: number[];
}

export interface Stop {
  id: string;
  label: string;
  count: number;
  colour: string;
  x: number;
  z: number;
  viewX: number;
  viewZ: number;
  viewYaw: number;
}

/** Games with no case to stand up, kept in a box at the end of their platform's run. */
export interface Crate {
  id: string;
  label: string;
  games: Game[];
  colour: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface Console {
  name: string;
  count: number;
  games: Game[];
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface RoomPlan {
  room: { width: number; depth: number; height: number };
  units: Unit[];
  slots: Slot[];
  stops: Stop[];
  crates: Crate[];
  consoles: Console[];
  start: { x: number; z: number; yaw: number };
  shelved: number;
  crated: number;
  cased: number;
}

/** A crate is only as wide as it needs to be; a shelf has no room to spare. */
const crateWidth = (n: number) => 0.05 + Math.min(0.07, n * 0.001);
const CRATE = { h: 0.09, d: 0.12 };

/** Shelf floors inside one unit, bottom to top: six in the body, then the extension's. */
function shelfHeights(): number[] {
  const inner = UNIT.body - UNIT.plinth - UNIT.panel;
  const step = inner / UNIT.compartments;
  const out: number[] = [];
  for (let i = 0; i < UNIT.compartments; i++) out.push(UNIT.plinth + step * i);
  out.push(UNIT.body + UNIT.panel);
  return out;
}
/** Headroom in a compartment, which is what limits how high a pile of flat boxes can go. */
const COMPARTMENT = (UNIT.body - UNIT.plinth - UNIT.panel) / UNIT.compartments - UNIT.panel - 0.015;

/** One thing standing on the shelf: usually a game, sometimes a box holding several. */
interface Item {
  game: Game;
  title: string;
  bundle?: Game[];
}

/** The leading words the titles in a box share, which is usually what's printed biggest on its spine. */
function sharedPrefix(titles: string[]): string {
  const bare = (w: string) => w.replace(/[^a-z0-9']/gi, '').toLowerCase();
  const words = titles.map((t) => t.split(/\s+/).filter(Boolean));
  const first = words[0] ?? [];
  let n = 0;
  while (n < first.length && words.every((w) => n < w.length && bare(w[n]) === bare(first[n]) && bare(first[n]))) n++;
  return first
    .slice(0, n)
    .join(' ')
    .replace(/[\s:,-]+$/, '');
}

/** What to print on the spine of a box holding several games. */
function boxTitle(games: Game[]): string {
  const edition = games.map((g) => (g.edition ?? '').replace(/^[\s-]+|[\s-]+$/g, '')).find(Boolean) ?? '';
  const prefix = sharedPrefix(games.map((g) => g.title));
  if (prefix && edition && !prefix.toLowerCase().includes(edition.toLowerCase())) return `${prefix}: ${edition}`;
  return edition || prefix || games[0].title;
}

/**
 * Several games in one physical box — a trilogy, an HD collection, the Orange Box. They give themselves away
 * by sharing a cover photograph: there is only one box, so there is only one picture of it. One spine stands
 * for all of them, and opening it lists what's inside.
 */
function bundled(list: Game[]): Item[] {
  const covers = new Map<string, Game[]>();
  for (const g of list) if (g.cover) covers.set(g.cover, [...(covers.get(g.cover) ?? []), g]);
  const boxes = [...covers.values()].filter((gs) => gs.length > 1);
  const inside = new Set(boxes.flat().map((g) => g.id));
  return [
    ...list.filter((g) => !inside.has(g.id)).map((game) => ({ game, title: game.title })),
    ...boxes.map((gs) => {
      const games = [...gs].sort((a, b) => a.title.localeCompare(b.title));
      return { game: games[0], title: boxTitle(games), bundle: games };
    }),
  ].sort((a, b) => a.title.localeCompare(b.title));
}

export function planRoom(games: Game[]): RoomPlan {
  const playable = games.filter((g) => !isBuiltIn(g));
  const byPlatform = new Map<string, Game[]>();
  for (const g of playable) byPlatform.set(g.platform, [...(byPlatform.get(g.platform) ?? []), g]);

  const shelved = new Map<string, Item[]>();
  const loose = new Map<string, Game[]>();
  for (const [platform, list] of byPlatform) {
    const items = bundled(list);
    shelved.set(platform, items.filter((item) => hasCase(item.game)));
    loose.set(
      platform,
      items.filter((item) => !hasCase(item.game)).flatMap((item) => item.bundle ?? [item.game]).sort((a, b) => a.title.localeCompare(b.title)),
    );
  }

  const heights = shelfHeights();
  const count = WALL.length;
  const width = Math.max(4.4, count * UNIT.width + 0.7);
  const room = { width, depth: ROOM.depth, height: ROOM.height };
  const left = -(count * UNIT.width) / 2 + UNIT.width / 2;
  const back = -room.depth / 2 + UNIT.depth / 2;
  const units: Unit[] = Array.from({ length: count }, (_, i) => ({ x: left + i * UNIT.width, z: back, shelves: heights }));

  // How many shelves each platform gets, so its last one can leave room for its crate.
  const runsOf = new Map<string, number>();
  const crated = new Set<string>();
  for (const unit of WALL) {
    for (const shelf of unit) {
      for (const run of shelf) {
        if (isCrate(run)) for (const platform of run.crate) crated.add(platform);
        else if (!run.onTopOf) runsOf.set(run.platform, (runsOf.get(run.platform) ?? 0) + 1);
      }
    }
  }
  const used = new Map<string, number>();
  const placed = new Map<string, number>();

  const slots: Slot[] = [];
  const crates: Crate[] = [];
  const where = new Map<string, { x: number; n: number }>();

  WALL.forEach((unitRuns, u) => {
    const unit = units[u];
    unitRuns.forEach((runs, s) => {
      // Shelves are numbered from the top, the way he reads them; the heights run the other way.
      const shelf = heights.length - 1 - s;
      const floor = unit.shelves[shelf] + UNIT.panel / 2;
      const startOf = unit.x - SHELF / 2 + INSET;
      let along = 0;
      // Where each platform's row began on this shelf, for anything piled on top of it.
      const rows = new Map<string, { x: number; top: number; level: number }>();

      for (const run of runs) {
        if (isCrate(run)) {
          const inside = run.crate.flatMap((platform) => loose.get(platform) ?? []).sort((a, b) => a.title.localeCompare(b.title));
          if (!inside.length) continue;
          const w = crateWidth(inside.length);
          crates.push({
            id: run.crate.join('+'),
            label: run.crate.join(', '),
            games: inside,
            colour: band(run.crate[0])[0],
            x: startOf + along + w / 2,
            y: floor + CRATE.h / 2,
            z: unit.z + UNIT.depth / 2 - CRATE.d / 2 - 0.02,
            w,
            h: CRATE.h,
            d: CRATE.d,
          });
          along += w + 0.008;
          continue;
        }

        const all = shelved.get(run.platform) ?? [];
        const from = used.get(run.platform) ?? 0;
        const [t, h, d] = caseOf(run.platform).map((mm) => mm / 1000);
        const spare = crated.has(run.platform) ? [] : loose.get(run.platform) ?? [];
        const mine = runsOf.get(run.platform) ?? 1;
        const last = (placed.get(run.platform) ?? 0) + 1 >= mine;
        // Boxes go on until the shelf is full and only then on to the next, which is how he fills them.
        const room_ = CLEAR - along - (last && spare.length ? crateWidth(spare.length) + 0.008 : 0);

        if (run.onTopOf) {
          // A short pile laid on top of another platform's row, at its left end.
          const under = rows.get(run.onTopOf);
          const take = all.slice(from);
          used.set(run.platform, from + take.length);
          placed.set(run.platform, (placed.get(run.platform) ?? 0) + 1);
          take.forEach((item, i) => {
            const base = under ? under.top : floor;
            const level = (under?.level ?? 0) + i;
            slots.push({
              game: item.game,
              title: item.title,
              bundle: item.bundle,
              x: (under ? under.x : startOf) + h / 2,
              y: base + t / 2 + level * t,
              z: unit.z + UNIT.depth / 2 - Math.min(d, UNIT.depth - 0.02) / 2 - 0.015,
              w: h,
              h: t,
              d: Math.min(d, UNIT.depth - 0.02),
              yaw: 0,
              flat: true,
              unit: u,
              shelf,
            });
          });
          if (under) under.level += take.length;
          for (const item of take) {
            const seen = where.get(item.game.platform) ?? { x: 0, n: 0 };
            where.set(item.game.platform, { x: seen.x + unit.x, n: seen.n + 1 });
          }
          continue;
        }

        if (run.flat) {
          // Laid flat and piled up: a pile goes as high as the shelf above allows, then a new one beside it.
          const perPile = Math.max(1, Math.floor(COMPARTMENT / t));
          const across = h;
          const piles = Math.max(0, Math.floor(room_ / across));
          const take = all.slice(from, from + piles * perPile);
          used.set(run.platform, from + take.length);
          take.forEach((item, i) => {
            slots.push({
              game: item.game,
              title: item.title,
              bundle: item.bundle,
              x: startOf + along + Math.floor(i / perPile) * across + across / 2,
              y: floor + t / 2 + (i % perPile) * t,
              z: unit.z + UNIT.depth / 2 - Math.min(d, UNIT.depth - 0.02) / 2 - 0.015,
              w: across,
              h: t,
              d: Math.min(d, UNIT.depth - 0.02),
              yaw: 0,
              flat: true,
              unit: u,
              shelf,
            });
          });
          const piled = Math.max(1, Math.ceil(take.length / perPile));
          const inLast = take.length - (piled - 1) * perPile;
          rows.set(run.platform, { x: startOf + along + (piled - 1) * across, top: floor + inLast * t, level: 0 });
          along += piled * across;
        } else {
          const fits = Math.max(0, Math.floor(room_ / t));
          const take = all.slice(from, from + fits);
          used.set(run.platform, from + take.length);
          rows.set(run.platform, { x: startOf + along, top: floor + h, level: 0 });
          take.forEach((item, i) => {
            slots.push({
              game: item.game,
              title: item.title,
              bundle: item.bundle,
              x: startOf + along + i * t + t / 2,
              y: floor + h / 2,
              z: unit.z + UNIT.depth / 2 - d / 2 - 0.015,
              w: t,
              h,
              d,
              yaw: 0,
              flat: false,
              unit: u,
              shelf,
            });
          });
          along += take.length * t;
        }
        placed.set(run.platform, (placed.get(run.platform) ?? 0) + 1);
        for (const item of all.slice(from, used.get(run.platform))) {
          const seen = where.get(item.game.platform) ?? { x: 0, n: 0 };
          where.set(item.game.platform, { x: seen.x + unit.x, n: seen.n + 1 });
        }

        // The crate sits at the end of the platform's last run.
        if (last && spare.length) {
          const w = crateWidth(spare.length);
          crates.push({
            id: run.platform,
            label: run.platform,
            games: spare,
            colour: band(run.platform)[0],
            x: startOf + along + 0.008 + w / 2,
            y: floor + CRATE.h / 2,
            z: unit.z + UNIT.depth / 2 - CRATE.d / 2 - 0.02,
            w,
            h: CRATE.h,
            d: CRATE.d,
          });
          along += w + 0.016;
        }
      }
    });
  });

  // Nothing is allowed to fall off the wall: anything that didn't fit joins its platform's crate.
  for (const [platform, all] of shelved) {
    const done = used.get(platform) ?? 0;
    if (done >= all.length) continue;
    const left = all.slice(done).flatMap((item) => item.bundle ?? [item.game]);
    const crate = crates.find((c) => c.id === platform || c.id.split('+').includes(platform));
    if (crate) crate.games = [...crate.games, ...left].sort((a, b) => a.title.localeCompare(b.title));
  }

  const inside = new Map<string, Game[]>();
  for (const g of games.filter(isBuiltIn)) inside.set(g.platform, [...(inside.get(g.platform) ?? []), g]);
  const built = [...inside].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const consoles: Console[] = [];
  const shelfUnit = units[CONSOLE_SHELF.unit];
  const consoleFloor = shelfUnit.shelves[heights.length - 1 - CONSOLE_SHELF.shelf] + UNIT.panel / 2;
  let along = 0;
  for (const [name, list] of built) {
    const w = Math.min(0.19, CLEAR / built.length - 0.02);
    consoles.push({
      name,
      count: list.length,
      games: [...list].sort((a, b) => a.title.localeCompare(b.title)),
      x: shelfUnit.x - SHELF / 2 + INSET + along + w / 2,
      y: consoleFloor + 0.03,
      z: shelfUnit.z + 0.02,
      w,
      h: 0.06,
      d: 0.14,
    });
    along += w + 0.02;
  }

  const stops: Stop[] = [...byPlatform]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([platform, list]) => {
      const seen = where.get(platform);
      const x = seen && seen.n ? seen.x / seen.n : 0;
      return {
        id: platform,
        label: platform,
        count: list.length,
        colour: band(platform)[0],
        x,
        z: back,
        viewX: Math.max(-room.width / 2 + 0.6, Math.min(room.width / 2 - 0.6, x)),
        viewZ: back + 1.7,
        viewYaw: 0,
      };
    });

  return {
    room,
    units,
    slots,
    stops,
    crates,
    consoles,
    start: { x: 0, z: room.depth / 2 - 0.5, yaw: 0 },
    shelved: slots.reduce((n, slot) => n + (slot.bundle?.length ?? 1), 0),
    crated: crates.reduce((n, c) => n + c.games.length, 0),
    cased: consoles.reduce((n, c) => n + c.count, 0),
  };
}
