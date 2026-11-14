import type { Game, GotmMonth, PlayStatus } from '../types';
import { acquiredSortKey, coverUrl, formatDate, formatMonthYear, hasPart } from './format';
import { monthPlayed } from './gotm';

/**
 * The programme behind the Screensaver: an endless run of short segments built from the collection itself.
 * Nothing here touches the DOM, so the component only has to show whatever `next()` hands it.
 */
export type Segment =
  | { kind: 'ident'; seconds: number; platform: string; count: number; covers: Game[] }
  | { kind: 'closeup'; seconds: number; game: Game; lines: string[] }
  | { kind: 'drift'; seconds: number; columns: Game[][] }
  | { kind: 'mosaic'; seconds: number; games: Game[]; value: string; caption: string }
  | { kind: 'marquee'; seconds: number; eyebrow: string; month: string; headline: Game | null; played: { game: Game; status: PlayStatus | null }[] };

/** The caption under the channel mark, so the corner always says what's on. */
export function segmentCaption(seg: Segment): string {
  switch (seg.kind) {
    case 'ident':
      return seg.platform;
    case 'closeup':
      return seg.game.platform;
    case 'drift':
      return 'The collection';
    case 'mosaic':
      return seg.caption;
    case 'marquee':
      // The segment prints its own eyebrow, so the corner carries the month instead.
      return seg.month;
  }
}

/** Every picture a segment will ask for, so the next one can be fetched while this one plays. */
export function segmentImages(seg: Segment): string[] {
  const of = (list: Game[]) => list.map(coverUrl).filter((u): u is string => !!u);
  switch (seg.kind) {
    case 'ident':
      return of(seg.covers);
    case 'closeup':
      return of([seg.game]);
    case 'drift':
      return of(seg.columns.flat());
    case 'mosaic':
      return of(seg.games);
    case 'marquee':
      return of([seg.headline, ...seg.played.map((p) => p.game)].filter((g): g is Game => !!g));
  }
}

const shuffled = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** The lines printed beside a cover in close-up: where the copy came from, and what became of it. */
function closeupLines(game: Game): string[] {
  const lines: string[] = [];
  if (game.edition) lines.push(game.edition);
  const where = game.boughtIn ? `Bought in ${game.boughtIn}` : 'Bought';
  // An exact date reads as written; free text like "Before 2012" is folded into the sentence.
  if (game.acquired) {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(game.acquired);
    lines.push(`${where}, ${iso ? formatDate(game.acquired) : game.acquired.toLowerCase()}`);
  }
  const times = game.timesCompleted ?? 0;
  if (game.status === 'Completed') {
    const when = game.completed && /^\d{4}-\d{2}-\d{2}$/.test(game.completed) ? ` in ${game.completed.slice(0, 4)}` : '';
    lines.push(times > 1 ? `Finished ${times} times` : `Finished${when}`);
  } else if (game.status === 'Not Completed') {
    lines.push(times > 0 ? 'Played, never finished' : 'Still waiting');
  } else if (game.status === 'Null') {
    lines.push('A game with no ending');
  } else if (game.status === 'Unplayable') {
    lines.push("Can't be played as it stands");
  }
  return lines.slice(0, 3);
}

/** The numbers that come up between segments. Each one is counted from the collection as it stands. */
function bumpers(games: Game[]): { value: string; caption: string }[] {
  const n = (x: number) => x.toLocaleString('en-GB');
  const year = String(new Date().getFullYear());
  const minutes = games.reduce((sum, g) => sum + (g.playtime ?? 0), 0);
  return [
    { value: n(games.length), caption: 'games in the house' },
    { value: n(new Set(games.map((g) => g.platform)).size), caption: 'platforms' },
    { value: n(games.filter((g) => g.status === 'Completed').length), caption: 'of them finished' },
    { value: n(new Set(games.map((g) => g.boughtIn).filter(Boolean)).size), caption: 'countries they were carried home from' },
    { value: n(games.filter((g) => acquiredSortKey(g.acquired).startsWith(year)).length), caption: `arrived in ${year}` },
    { value: n(games.filter((g) => hasPart(g, 'Box') && hasPart(g, 'Cover')).length), caption: 'boxed, with their covers' },
    { value: n(games.filter((g) => (g.rating ?? 0) >= 90).length), caption: 'rated 90 or over' },
    { value: `${n(Math.round(minutes / 60))} h`, caption: 'on the clock, where it was counted' },
  ];
}

/** The order the channel runs in: close-ups carry it, the rest break it up, an ident every few. */
const CYCLE: Segment['kind'][] = ['closeup', 'drift', 'ident', 'closeup', 'marquee', 'closeup', 'mosaic', 'ident', 'closeup', 'drift'];

const SECONDS: Record<Segment['kind'], number> = { ident: 4.5, closeup: 7.5, drift: 11, mosaic: 9, marquee: 9 };

export function createProgramme(games: Game[], months: GotmMonth[], link: (ref: { title: string; platform: string } | null) => Game | null) {
  /**
   * What can be put on screen as a picture: one game per photograph, and nothing built into a console,
   * since all 105 of those share six pictures of the consoles themselves.
   */
  const seenCover = new Set<string>();
  const withCover = games.filter((g) => {
    if (!g.cover || g.condition.includes('Built-in Console') || seenCover.has(g.cover)) return false;
    seenCover.add(g.cover);
    return true;
  });
  /** Pictures by platform, for idents; the counts beside them come from the whole collection. */
  const byPlatform = new Map<string, Game[]>();
  for (const g of withCover) byPlatform.set(g.platform, [...(byPlatform.get(g.platform) ?? []), g]);
  const allByPlatform = new Map<string, Game[]>();
  for (const g of games) allByPlatform.set(g.platform, [...(allByPlatform.get(g.platform) ?? []), g]);
  const identPlatforms = [...byPlatform].filter(([, list]) => list.length >= 8).map(([p]) => p);
  const facts = shuffled(bumpers(games));
  /** Months worth putting on the marquee: the one running now, and any with a winner. */
  const marqueeMonths = months.filter((m, i) => i === 0 || m.gameOfTheMonth);

  let step = 0;
  let factAt = 0;
  let closeups: Game[] = [];
  let covers: Game[] = [];
  /** What the channel has already shown, so a mosaic can be built out of pictures the browser already holds. */
  const shown: Game[] = [];

  const draw = (pool: 'closeup' | 'cover'): Game => {
    if (pool === 'closeup') {
      if (!closeups.length) closeups = shuffled(withCover);
      return closeups.pop()!;
    }
    if (!covers.length) covers = shuffled(withCover);
    return covers.pop()!;
  };

  /** A run of distinct pictures, never asking for more than the collection holds. */
  const take = (count: number): Game[] => {
    const out: Game[] = [];
    const seen = new Set<number>();
    const want = Math.min(count, withCover.length);
    while (out.length < want) {
      const g = draw('cover');
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  };

  const remember = (list: Game[]) => {
    for (const g of list) if (!shown.some((s) => s.id === g.id)) shown.push(g);
    if (shown.length > 120) shown.splice(0, shown.length - 120);
  };

  function build(kind: Segment['kind']): Segment {
    const seconds = SECONDS[kind];
    switch (kind) {
      case 'ident': {
        const platform = pick(identPlatforms);
        const list = byPlatform.get(platform)!;
        const strip = shuffled(list).slice(0, 7);
        remember(strip);
        // The count is the platform's real total, pictures or not.
        return { kind, seconds, platform, count: allByPlatform.get(platform)!.length, covers: strip };
      }
      case 'closeup': {
        const game = draw('closeup');
        remember([game]);
        return { kind, seconds, game, lines: closeupLines(game) };
      }
      case 'drift': {
        const list = take(20);
        remember(list);
        return { kind, seconds, columns: [0, 1, 2, 3].map((c) => list.slice(c * 5, c * 5 + 5)) };
      }
      case 'mosaic': {
        // Built from covers already on screen this session first, so the number lands over a recap,
        // then topped up from the pool — which can hand back a game already taken, hence the set.
        const seen = new Set<number>();
        const list: Game[] = [];
        const add = (g: Game) => (seen.has(g.id) ? false : (seen.add(g.id), list.push(g), true));
        for (const g of shuffled(shown)) if (list.length < 28) add(g);
        for (let tries = 0; list.length < 28 && tries < 200; tries++) add(draw('cover'));
        const fact = facts[factAt++ % facts.length];
        return { kind, seconds, games: shuffled(list), ...fact };
      }
      case 'marquee': {
        if (!marqueeMonths.length) return build('closeup');
        const month = pick(marqueeMonths);
        const played = monthPlayed(month.gameOfTheMonth, month.played)
          .map((p) => ({ game: link(p), status: p.status }))
          .filter((p): p is { game: Game; status: PlayStatus | null } => !!p.game)
          .slice(0, 5);
        const headline = link(month.gameOfTheMonth);
        if (!headline && !played.length) return build('closeup');
        remember([headline, ...played.map((p) => p.game)].filter((g): g is Game => !!g));
        return {
          kind,
          seconds,
          eyebrow: month.gameOfTheMonth ? 'Game of the Month' : 'Now playing',
          month: formatMonthYear(month.month),
          headline,
          played,
        };
      }
    }
  }

  return {
    next(): Segment {
      return build(CYCLE[step++ % CYCLE.length]);
    },
  };
}
