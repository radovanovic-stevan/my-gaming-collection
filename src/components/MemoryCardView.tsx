import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types';
import { Cover } from './Cover';
import { dateKey } from '../lib/query';
import { formatDate } from '../lib/format';

const SOUND_KEY = 'memory-card-sound';

/** The one console whose browser this is. */
const PLATFORM = 'PS2';

/** How long a held direction waits before it starts repeating, and how fast it repeats after that. */
const HOLD_FIRST = 420;
const HOLD_NEXT = 110;
/** A stick has to be pushed this far to count as a direction. */
const DEADZONE = 0.55;

type Dir = 'up' | 'down' | 'left' | 'right';

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const loadSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
};

/**
 * The browser's own clicks: a short blip for moving, a rounder one for opening. Built on the spot from
 * an oscillator, so there's nothing to download and nothing plays until the sound is switched on.
 */
function useBlips(on: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(
    () => () => {
      void ctx.current?.close().catch(() => undefined);
      ctx.current = null;
    },
    [],
  );
  return useCallback(
    (kind: 'move' | 'enter') => {
      if (!on) return;
      try {
        ctx.current ??= new AudioContext();
        const audio = ctx.current;
        void audio.resume().catch(() => undefined);
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const now = audio.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(kind === 'move' ? 1180 : 760, now);
        if (kind === 'enter') osc.frequency.exponentialRampToValueAtTime(1500, now + 0.09);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(kind === 'move' ? 0.05 : 0.09, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'move' ? 0.07 : 0.16));
        osc.connect(gain).connect(audio.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch {
        /* no audio here, and the browser works the same without it */
      }
    },
    [on],
  );
}

/**
 * What the save is worth: a minute played counts as a kilobyte, which is as true as any save size.
 * A game that was finished and never timed gets the words the console used for exactly that.
 */
const blocks = (game: Game) =>
  game.playtime ? `${game.playtime.toLocaleString('en-GB')} KB` : game.status === 'Completed' ? 'Clear data' : 'No data';

/** The line under the name, in the browser's own flat voice. */
function details(game: Game): string {
  const bits: string[] = [];
  if (game.acquired) bits.push(`Saved ${/^\d{4}-\d{2}-\d{2}$/.test(game.acquired) ? formatDate(game.acquired) : game.acquired}`);
  if (game.status === 'Completed') bits.push(game.timesCompleted && game.timesCompleted > 1 ? `Finished ${game.timesCompleted} times` : 'Finished');
  else if (game.status === 'Null') bits.push('No ending');
  else if (game.status === 'Unplayable') bits.push('Corrupted');
  if (game.rating !== null) bits.push(`Rated ${game.rating}`);
  return bits.join('   ');
}

/**
 * The PlayStation 2 browser, with the collection's PS2 games in place of saves: the blue room, the grid of
 * icons, and a pad if there's one plugged in. Arrows or the stick move, Circle opens, Cross steps back.
 */
export default function MemoryCardView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  // Newest first, the way the console put the last save you made at the front.
  const saves = useMemo(
    () =>
      games
        .filter((g) => g.platform === PLATFORM)
        .sort((a, b) => (dateKey(b.acquired) ?? '').localeCompare(dateKey(a.acquired) ?? '') || b.id - a.id),
    [games],
  );
  const [at, setAt] = useState(0);
  const [sound, setSound] = useState(loadSound);
  const [pad, setPad] = useState(false);
  const blip = useBlips(sound);
  const grid = useRef<HTMLDivElement>(null);
  /** How many icons fit on a row, read off the grid so the cursor moves the way the eye does. */
  const perRow = useRef(1);
  /**
   * Whether the mouse is the one driving. Keyboard moves scroll the grid, which slides icons under a
   * mouse sitting still and fires mouseenter on them; without this the pointer would steal the cursor back.
   */
  const mouseLeads = useRef(false);

  const here = saves[Math.min(at, saves.length - 1)] ?? null;

  const measure = useCallback(() => {
    const el = grid.current;
    if (!el) return;
    const style = getComputedStyle(el);
    perRow.current = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
  }, []);
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (grid.current) observer.observe(grid.current);
    return () => observer.disconnect();
  }, [measure, saves.length]);

  const move = useCallback(
    (dir: Dir) => {
      mouseLeads.current = false;
      setAt((i) => {
        const step = dir === 'left' ? -1 : dir === 'right' ? 1 : dir === 'up' ? -perRow.current : perRow.current;
        const next = Math.max(0, Math.min(saves.length - 1, i + step));
        if (next !== i) blip('move');
        return next;
      });
    },
    [blip, saves.length],
  );

  const openGame = useCallback(
    (game: Game) => {
      blip('enter');
      onOpen(game);
    },
    [blip, onOpen],
  );
  /** What the pad and the keyboard open: whatever the cursor is on. */
  const open = useCallback(() => {
    if (here) openGame(here);
  }, [here, openGame]);

  /** The handlers as they stand, so the pad loop below can be set up once and left alone. */
  const act = useRef({ move, open });
  act.current = { move, open };

  // The cursor stays on screen as it travels through 250 of them.
  useEffect(() => {
    grid.current?.children[at]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [at]);

  // Keys: the arrows or WASD, Enter to open. A game's own window takes the keyboard while it's up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop')) return;
      const dir = KEYS[e.code];
      if (dir) {
        e.preventDefault();
        move(dir);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, open]);

  /**
   * A pad, if one is plugged in: the d-pad and the left stick move, Circle opens, Cross steps back out of
   * whatever a Circle opened. Held directions repeat, slowly at first.
   */
  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    let held: Dir | null = null;
    let repeatAt = 0;
    let wasOpen = false;
    let wasBack = false;

    const poll = () => {
      frame = requestAnimationFrame(poll);
      const gp = [...navigator.getGamepads()].find((g): g is Gamepad => !!g?.connected);
      setPad(Boolean(gp));
      if (!gp) return;

      const [x = 0, y = 0] = gp.axes;
      const dpad = (n: number) => gp.buttons[n]?.pressed ?? false;
      const dir: Dir | null = dpad(12) || y < -DEADZONE ? 'up' : dpad(13) || y > DEADZONE ? 'down' : dpad(14) || x < -DEADZONE ? 'left' : dpad(15) || x > DEADZONE ? 'right' : null;

      const now = performance.now();
      if (dir !== held) {
        held = dir;
        if (dir) {
          act.current.move(dir);
          repeatAt = now + HOLD_FIRST;
        }
      } else if (dir && now >= repeatAt) {
        act.current.move(dir);
        repeatAt = now + HOLD_NEXT;
      }

      // Circle opens the save; Cross closes whatever is open, as it did on the console.
      const circle = gp.buttons[1]?.pressed ?? false;
      if (circle && !wasOpen) act.current.open();
      wasOpen = circle;
      const cross = gp.buttons[0]?.pressed ?? false;
      // Escape is what closes a game's window here, and it goes to the body so it reads as a real one.
      if (cross && !wasBack) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      wasBack = cross;
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleSound = () => {
    setSound((s) => {
      try {
        localStorage.setItem(SOUND_KEY, s ? 'off' : 'on');
      } catch {
        /* it just won't be remembered */
      }
      return !s;
    });
  };

  if (!saves.length) return <div className="empty">No PlayStation 2 games to browse.</div>;

  return (
    <div className="mc">
      <div className="mc-sky" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="mc-head">
        <span className="mc-crumb">Browser</span>
        <strong className="mc-name">{here?.title}</strong>
        <span className="mc-line">{here ? details(here) : ''}</span>
      </div>

      <div
        className="mc-grid"
        ref={grid}
        role="listbox"
        aria-label="PlayStation 2 saves"
        tabIndex={0}
        onMouseMove={() => (mouseLeads.current = true)}
      >
        {saves.map((game, i) => (
          <button
            key={game.id}
            className={`mc-save${i === at ? ' on' : ''}`}
            role="option"
            aria-selected={i === at}
            onMouseEnter={() => mouseLeads.current && setAt(i)}
            onFocus={() => setAt(i)}
            onClick={() => ((mouseLeads.current = true), setAt(i), openGame(game))}
          >
            <span className="mc-icon">
              <span className="mc-icon-face">
                <Cover game={game} />
              </span>
            </span>
            <span className="mc-title">{game.title}</span>
          </button>
        ))}
      </div>

      <div className="mc-foot">
        <span className="mc-size">{here ? blocks(here) : ''}</span>
        <span className="mc-legend">
          <span className="mc-btn circle" aria-hidden="true" />
          Open
          <span className="mc-btn cross" aria-hidden="true" />
          Back
          <span className="mc-count">
            {at + 1} / {saves.length}
          </span>
          {pad && <span className="mc-pad">Pad connected</span>}
          <button className="mc-sound" onClick={toggleSound} aria-pressed={sound}>
            Sound {sound ? 'on' : 'off'}
          </button>
        </span>
      </div>
    </div>
  );
}
