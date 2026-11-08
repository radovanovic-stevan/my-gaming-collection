import { useMemo, useState } from 'react';
import type { Game, GameRef, GotmMonth, Query } from '../types';
import { buildBacklog, yearsOwned, type Waiting } from '../lib/backlog';
import { formatDate, formatMonthYear } from '../lib/format';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge } from './Badges';

interface Props {
  games: Game[];
  months: GotmMonth[];
  link: (ref: GameRef) => Game | null;
  onOpen: (game: Game) => void;
  /** Opens the collection with these filters. */
  onShowGames: (filters: Partial<Query>) => void;
}

/** Rows shown before "Show all"; enough to fill a few lines without loading hundreds of covers. */
const PAGE = 24;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="sv-tile">
      <span className="eyebrow">{label}</span>
      <span className="sv-tile-value">{value}</span>
      <span className="muted">{detail}</span>
    </div>
  );
}

function Row({ entry, note, onOpen }: { entry: Waiting; note: string; onOpen: (game: Game) => void }) {
  const g = entry.game;
  return (
    <li className="bl-row">
      <button className="bl-cover" onClick={() => onOpen(g)} aria-label={g.title}>
        <Cover game={g} />
      </button>
      <div className="bl-info">
        <button className="ref-link" onClick={() => onOpen(g)} title="Open in collection">
          <span className="ref-title">{g.title}</span>
        </button>
        <span className="bl-meta">
          <PlatformBadge platform={g.platform} />
          <RatingBadge rating={g.rating} />
        </span>
        <span className="muted small">{note}</span>
        {g.percent !== null && (
          <span className="bl-progress" title={`${g.percent}% complete`}>
            <span className="bl-progress-track">
              <span className="bl-progress-bar" style={{ width: `${Math.min(100, Math.max(0, g.percent))}%` }} />
            </span>
            <span className="muted small">{g.percent}%</span>
          </span>
        )}
      </div>
    </li>
  );
}

function Section({
  title,
  entries,
  note,
  onOpen,
}: {
  title: string;
  entries: Waiting[];
  note: (entry: Waiting) => string;
  onOpen: (game: Game) => void;
}) {
  const [all, setAll] = useState(false);
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, PAGE);
  return (
    <section className="bl-section">
      <h2 className="section-title">
        {title} <span className="muted">{entries.length}</span>
      </h2>
      <ul className="bl-grid">
        {shown.map((w) => (
          <Row key={w.game.id} entry={w} note={note(w)} onOpen={onOpen} />
        ))}
      </ul>
      {entries.length > PAGE && (
        <button className="link" onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

/** Everything still waiting to be played, oldest first: what the collection is owed. */
export default function BacklogView({ games, months, link, onOpen, onShowGames }: Props) {
  const today = useMemo(() => new Date(), []);
  const backlog = useMemo(() => buildBacklog(games, months, link, today), [games, months, link, today]);
  const { started, never, blocked } = backlog;

  const owned = (w: Waiting) => {
    const years = yearsOwned(w.game, today);
    const since = formatDate(w.game.acquired);
    return years === null ? `Owned since ${since}` : `Owned since ${since} · ${plural(years, 'year')}`;
  };
  const longest = never[0] ? yearsOwned(never[0].game, today) : null;
  const waiting = started.length + never.length;

  if (!waiting && !blocked.length) return <div className="empty">Nothing waiting — the whole collection is finished.</div>;

  return (
    <section className="backlog">
      <div className="awards-head">
        <div>
          <h2>Backlog</h2>
          <p className="muted">
            Everything still waiting. A rating means it was played: with one it was set aside, without one it was never started. What's in
            progress this month is left out.
          </p>
        </div>
        <div className="awards-actions">
          <button className="btn" onClick={() => onShowGames({ statuses: ['Not Completed'], sort: [{ key: 'acquired', dir: 'asc' }] })}>
            Open in collection
          </button>
        </div>
      </div>

      <section className="sv-tiles" aria-label="Highlights">
        <Tile label="Still waiting" value={String(waiting)} detail={`of ${games.length} games`} />
        <Tile label="Never started" value={String(never.length)} detail="bought, never played" />
        <Tile label="Started, not finished" value={String(started.length)} detail="rated, never finished" />
        <Tile
          label="Longest wait"
          value={longest === null ? '—' : `${longest}y`}
          detail={never[0] ? never[0].game.title : 'nothing waiting'}
        />
      </section>

      <Section
        title="Started, then set aside"
        entries={started}
        note={(w) => (w.month ? `Last played ${formatMonthYear(w.month)}` : owned(w))}
        onOpen={onOpen}
      />

      <Section
        title="Never started"
        entries={never}
        note={owned}
        onOpen={onOpen}
      />

      <Section
        title="Can't play"
        entries={blocked}
        note={owned}
        onOpen={onOpen}
      />
    </section>
  );
}
