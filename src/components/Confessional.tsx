import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../types';
import type { Waiting } from '../lib/backlog';
import { formatDate } from '../lib/format';
import { Cover } from './Cover';
import { PlatformBadge } from './Badges';

interface Props {
  /** The never-started games, longest owned first. */
  entries: Waiting[];
  onOpen: (game: Game) => void;
}

const DAY = 86_400_000;
const isoAcquired = (g: Game) => (g.acquired && /^\d{4}-\d{2}-\d{2}$/.test(g.acquired) ? g.acquired : null);
const startOf = (g: Game) => new Date(`${isoAcquired(g)}T00:00:00`).getTime();
const pad = (n: number) => String(n).padStart(2, '0');
const count = (n: number) => n.toLocaleString('en-GB');

/**
 * The worst offender in the backlog, with the clock still running on it.
 *
 * The Backlog's own list says what is waiting; this says how long, to the second, and keeps saying it. Only
 * games with an exact purchase date can be counted this precisely, so the vague ones sit it out.
 */
export default function Confessional({ entries, onOpen }: Props) {
  const dated = useMemo(() => entries.filter((w) => isoAcquired(w.game)), [entries]);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Its own component so the tick doesn't re-render the backlog's hundreds of rows behind it.
  useEffect(() => {
    const id = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const total = useMemo(() => dated.reduce((sum, w) => sum + Math.floor((Date.now() - startOf(w.game)) / DAY), 0), [dated]);

  if (!dated.length) return null;

  const entry = dated[Math.min(i, dated.length - 1)];
  const game = entry.game;
  const ms = Math.max(0, now - startOf(game));
  const days = Math.floor(ms / DAY);
  const rest = ms - days * DAY;

  return (
    <section className="confessional" aria-label="The Confessional">
      <div className="cf-head">
        <h2 className="section-title">The Confessional</h2>
        <span className="cf-position">
          {i + 1} of {count(dated.length)}
        </span>
      </div>

      <div className="cf-body">
        <button className="cf-cover" onClick={() => onOpen(game)} aria-label={`Open ${game.title}`}>
          <Cover game={game} />
        </button>

        <div className="cf-text">
          <button className="cf-title" onClick={() => onOpen(game)}>
            {game.title}
          </button>
          <span className="cf-meta">
            <PlatformBadge platform={game.platform} />
            <span className="cf-bought">Bought {formatDate(game.acquired)}. Never started.</span>
          </span>

          <p className="cf-clock" aria-label={`Owned for ${count(days)} days`}>
            <span className="cf-days">{count(days)}</span>
            <span className="cf-unit">days</span>
            <span className="cf-time" aria-hidden="true">
              {pad(Math.floor(rest / 3_600_000))}:{pad(Math.floor((rest % 3_600_000) / 60_000))}:{pad(Math.floor((rest % 60_000) / 1000))}
            </span>
          </p>

          <div className="cf-actions">
            <button className="btn cf-btn" onClick={() => setI((n) => (n + 1) % dated.length)}>
              Next
            </button>
            <button className="btn cf-btn" onClick={() => setI(0)} disabled={i === 0}>
              Back to the worst
            </button>
          </div>
        </div>
      </div>

      <p className="cf-total">
        {count(dated.length)} games bought and never started. Between them they have waited {count(total)} days — {Math.round(total / 365.25)} years of
        unplayed time.
      </p>
    </section>
  );
}
