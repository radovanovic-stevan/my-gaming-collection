import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types';
import { Cover } from './Cover';
import { PlatformBadge } from './Badges';

const STORE = 'guess-my-rating-stats';

type Stats = { played: number; error: number; best: number | null };
const NO_STATS: Stats = { played: 0, error: 0, best: null };

// Stats live only in this browser; without storage the game still plays, it just forgets.
function load(): Stats {
  try {
    return { ...NO_STATS, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Stats>) };
  } catch {
    return NO_STATS;
  }
}
function save(stats: Stats) {
  try {
    localStorage.setItem(STORE, JSON.stringify(stats));
  } catch {
    /* nothing to do */
  }
}

const draw = (pool: Game[], not: Game | null) => {
  const fresh = not ? pool.filter((g) => g !== not) : pool;
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
};

/** How wrong the guess was, in the game's own words. */
const verdict = (gap: number) =>
  gap === 0 ? 'Exactly right' : gap <= 2 ? 'Dead on' : gap <= 5 ? 'Close' : gap <= 10 ? 'In the area' : gap <= 20 ? 'Off' : 'Not a clue';

/** A game from the collection: what did you score it? The gap is the point. */
export default function RatingView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const pool = useMemo(() => games.filter((g) => g.rating !== null), [games]);
  const [stats, setStats] = useState<Stats>(load);
  const [game, setGame] = useState<Game | null>(() => (pool.length ? draw(pool, null) : null));
  const [typed, setTyped] = useState('');
  const [locked, setLocked] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);

  // Every new game starts in the box, so the whole round is keyboard-only.
  useEffect(() => {
    if (locked === null) field.current?.focus();
  }, [game, locked]);

  if (!game) return <div className="empty">Not enough rated games to play yet.</div>;

  const actual = game.rating!;
  const entered = Number(typed);
  // Sixty of the ratings end in .5, so a half point has to be typeable.
  const valid = /^\d{1,3}(\.\d)?$/.test(typed) && entered >= 0 && entered <= 100;
  const average = stats.played ? Math.round(stats.error / stats.played) : null;
  const gap = locked === null ? 0 : Math.abs(actual - locked);

  const lock = () => {
    if (locked !== null || !valid) return;
    const missed = Math.abs(actual - entered);
    setLocked(entered);
    const updated: Stats = {
      played: stats.played + 1,
      error: stats.error + missed,
      best: stats.best === null ? missed : Math.min(stats.best, missed),
    };
    setStats(updated);
    save(updated);
  };

  const next = () => {
    setGame(draw(pool, game));
    setTyped('');
    setLocked(null);
  };

  return (
    <div className="guess gr">
      <header className="gg-head">
        <div>
          <h2>Guess My Rating</h2>
          <p className="muted">What did you score this one? The running average is how far off you are about your own taste.</p>
        </div>
        <div className="gg-stats">
          <span>
            <b>{average === null ? '—' : average}</b> off on average
          </span>
          <span>
            <b>{stats.best === null ? '—' : stats.best}</b> best
          </span>
          {stats.played > 0 && (
            <span>
              <b>{stats.played}</b> guesses
            </span>
          )}
        </div>
      </header>

      <div className="gr-main">
        <div className="gr-cover">
          <Cover game={game} eager />
        </div>
        <span className="gr-title">{game.title}</span>
        <PlatformBadge platform={game.platform} />

        {locked === null ? (
          <form
            className="gr-entry"
            onSubmit={(e) => {
              e.preventDefault();
              lock();
            }}
          >
            <span className="gr-field">
              <input
                ref={field}
                className="gr-input"
                type="text"
                inputMode="decimal"
                maxLength={5}
                value={typed}
                aria-label="Your guess, out of 100; half points allowed"
                onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              />
            </span>
            <span className="gr-hint">out of 100 · whole or half points · Enter locks it in</span>
            <button className="btn primary" type="submit" disabled={!valid}>
              Lock it in
            </button>
          </form>
        ) : (
          <div className="gr-result">
            <div className="gr-nums">
              <span className="gr-num">
                <i>you said</i>
                <b>{locked}</b>
              </span>
              <span className="gr-apart">
                <b>{gap}</b>
                <i>{gap === 1 ? 'point apart' : 'points apart'}</i>
              </span>
              <span className="gr-num gr-num-real">
                <i>you scored it</i>
                <b>{actual}</b>
              </span>
            </div>
            <div className="gr-track" aria-hidden="true">
              <span className="gr-span" style={{ left: `${Math.min(locked, actual)}%`, width: `${gap}%` }} />
              <span className="gr-dot gr-dot-guess" style={{ left: `${locked}%` }} />
              <span className="gr-dot gr-dot-real" style={{ left: `${actual}%` }} />
            </div>
            <p className={`gr-verdict ${gap <= 5 ? 'gr-near' : gap > 20 ? 'gr-far' : ''}`} role="status">
              <b>{verdict(gap)}</b>
              {gap === 0 ? ' — not a point between them.' : ` — ${gap} ${gap === 1 ? 'point' : 'points'} too ${locked > actual ? 'generous' : 'harsh'}.`}
            </p>
            <div className="gr-actions">
              <button className="btn primary" onClick={next} autoFocus>
                Next game
              </button>
              <button className="link" onClick={() => onOpen(game)}>
                Open {game.title}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
