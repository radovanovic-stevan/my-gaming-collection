import { useMemo, useState } from 'react';
import type { Game } from '../types';
import { Cover } from './Cover';
import { PlatformBadge } from './Badges';

const STORE = 'higher-or-lower-stats';

type Stats = { played: number; best: number; last: number };
const NO_STATS: Stats = { played: 0, best: 0, last: 0 };

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

const other = (pool: Game[], not: Game[]) => {
  const fresh = pool.filter((g) => !not.includes(g));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
};

type Round = { left: Game; right: Game; pick: 'higher' | 'lower' | null };

function Card({ game, rating }: { game: Game; rating: number | null }) {
  return (
    <div className="hl-card">
      <div className="hl-cover">
        <Cover game={game} eager />
      </div>
      <span className="hl-title">{game.title}</span>
      <PlatformBadge platform={game.platform} />
      <span className="hl-rating">{rating === null ? '?' : rating}</span>
    </div>
  );
}

/** Two games from the collection: is the hidden one rated higher or lower? One wrong answer ends the run. */
export default function HigherLowerView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const pool = useMemo(() => games.filter((g) => g.rating !== null), [games]);
  const [stats, setStats] = useState<Stats>(load);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState<Round | null>(() => {
    if (pool.length < 2) return null;
    const left = other(pool, []);
    return { left, right: other(pool, [left]), pick: null };
  });

  if (!round) return <div className="empty">Not enough rated games to play yet.</div>;

  const { left, right, pick } = round;
  // Equal ratings go to the player: there's no way to tell them apart.
  const right2 = right.rating!;
  const correct = pick === null ? null : pick === 'higher' ? right2 >= left.rating! : right2 <= left.rating!;

  const record = (best: number) => {
    const updated = { played: stats.played + 1, best: Math.max(stats.best, best), last: best };
    setStats(updated);
    save(updated);
  };

  const guess = (choice: 'higher' | 'lower') => {
    if (pick) return;
    const won = choice === 'higher' ? right2 >= left.rating! : right2 <= left.rating!;
    setRound({ ...round, pick: choice });
    if (won) setScore(score + 1);
    else record(score);
  };

  // Right slides into the left seat, so the chain keeps its last answer on screen.
  const next = () => setRound({ left: right, right: other(pool, [left, right]), pick: null });
  const again = () => {
    setScore(0);
    const first = other(pool, [left, right]);
    setRound({ left: first, right: other(pool, [first]), pick: null });
  };

  return (
    <div className="guess hl">
      <header className="gg-head">
        <div>
          <h2>Higher or Lower</h2>
          <p className="muted">Is the hidden game rated higher or lower than the one on the left? One wrong answer ends the run.</p>
        </div>
        <div className="gg-stats">
          <span>
            <b>{score}</b> streak
          </span>
          <span>
            <b>{stats.best}</b> best
          </span>
          {stats.played > 0 && (
            <span>
              <b>{stats.played}</b> runs
            </span>
          )}
        </div>
      </header>

      <div className="hl-main">
        <Card game={left} rating={left.rating} />
        <div className="hl-mid">
          {pick === null ? (
            <>
              <button className="btn primary hl-btn" onClick={() => guess('higher')}>
                ↑ Higher
              </button>
              <button className="btn hl-btn" onClick={() => guess('lower')}>
                ↓ Lower
              </button>
            </>
          ) : (
            <div className={`hl-verdict ${correct ? 'gg-won' : 'gg-lost'}`}>
              <span className="eyebrow">{correct ? 'Correct' : `Wrong — run of ${score}`}</span>
              {correct ? (
                <button className="btn primary hl-btn" onClick={next} autoFocus>
                  Keep going
                </button>
              ) : (
                <button className="btn primary hl-btn" onClick={again} autoFocus>
                  Play again
                </button>
              )}
            </div>
          )}
        </div>
        <Card game={right} rating={pick === null ? null : right2} />
      </div>

      {pick !== null && (
        <p className="muted gg-legend">
          <button className="link" onClick={() => onOpen(right)}>
            Open {right.title}
          </button>
        </p>
      )}
    </div>
  );
}
