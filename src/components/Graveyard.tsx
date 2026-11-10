import { useMemo } from 'react';
import type { Game, GameRef, GotmMonth } from '../types';
import { buildGraveyard, type Plot, type Tier } from '../lib/graveyard';

interface Props {
  games: Game[];
  /** Null until gotm.json has loaded; the yard waits rather than calling everything never played. */
  months: GotmMonth[] | null;
  link: (ref: GameRef) => Game | null;
  /** Opens the collection filtered to one platform. */
  onShowGames: (platform: string) => void;
}

/** What the stone says above the name. */
const LABEL: Record<Tier, string> = { warm: 'still warm', cold: 'resting', dead: 'R.I.P.', never: 'unmarked' };

const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const monthOf = (date: string) => shortMonth.format(new Date(`${date}T00:00:00`));
const count = (n: number) => n.toLocaleString('en-GB');

function Stone({ plot, onShowGames }: { plot: Plot; onShowGames: (platform: string) => void }) {
  const { platform, days, title, date, tier } = plot;
  return (
    <li className="gy-plot">
      <button className={`gy-stone gy-${tier}`} onClick={() => onShowGames(platform)} title={`Show the ${platform} games`}>
        <span className="gy-label">{LABEL[tier]}</span>
        <span className="gy-name">{platform}</span>
        <span className="gy-days">{days === null ? '—' : count(days)}</span>
        <span className="gy-unit">{days === null ? 'no record of play' : days === 1 ? 'day untouched' : 'days untouched'}</span>
        <span className="gy-epitaph">{title && date ? `${title} · ${monthOf(date)}` : 'never played'}</span>
      </button>
      <span className="gy-plinth">{count(plot.games)} games</span>
    </li>
  );
}

/** Every platform as a headstone, longest untouched first. */
export default function Graveyard({ games, months, link, onShowGames }: Props) {
  const today = useMemo(() => new Date(), []);
  const plots = useMemo(() => (months ? buildGraveyard(games, months, link, today) : []), [games, months, link, today]);
  if (!plots.length) return null;
  const dead = plots.filter((p) => p.tier === 'dead' || p.tier === 'never').length;

  return (
    <section className="graveyard">
      <div className="gy-head">
        <h3 className="section-title">The graveyard</h3>
        <span className="gy-sub">
          {dead} of {plots.length} platforms haven't been touched in over a year
        </span>
      </div>
      <ul className="gy-yard">
        {plots.map((p) => (
          <Stone key={p.platform} plot={p} onShowGames={onShowGames} />
        ))}
      </ul>
      <p className="gy-note">
        Counted from the Game of the Month log and from completion dates. The log only knows the month, so a month counts at its end. Click a stone for
        its games.
      </p>
    </section>
  );
}
