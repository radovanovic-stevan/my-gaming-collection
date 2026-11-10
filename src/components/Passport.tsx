import { useMemo } from 'react';
import type { Game } from '../types';
import { buildPassport, stampStyle, type Stamp } from '../lib/passport';

interface Props {
  games: Game[];
  /** The country whose games the Map is showing, if any. */
  selected: string | null;
  onSelect: (country: string | null) => void;
}

const stampDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "2013-02-02" as "02 FEB 2013"; anything vaguer is stamped as it was written. */
function inked(first: string | null): string {
  if (!first) return 'DATE UNKNOWN';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return first.toUpperCase();
  return stampDate.format(new Date(`${first}T00:00:00`)).toUpperCase();
}

function StampMark({ stamp, selected, onSelect }: { stamp: Stamp; selected: boolean; onSelect: (country: string | null) => void }) {
  const { ink, shape, angle } = stampStyle(stamp.country);
  return (
    <li>
      <button
        className={`ps-stamp ps-${shape} ps-ink-${ink} ${selected ? 'on' : ''}`}
        style={{ '--angle': `${angle}deg` } as React.CSSProperties}
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : stamp.country)}
        title={`${stamp.games} games bought in ${stamp.country}`}
      >
        <span className="ps-entry">entry</span>
        <span className="ps-country">{stamp.country}</span>
        <span className="ps-date">{inked(stamp.first)}</span>
        <span className="ps-count">{stamp.games === 1 ? '1 game' : `${stamp.games} games`}</span>
      </button>
    </li>
  );
}

/** Every country as a stamp in a passport page, in the order they were first bought in. */
export default function Passport({ games, selected, onSelect }: Props) {
  const stamps = useMemo(() => buildPassport(games), [games]);
  if (!stamps.length) return null;

  return (
    <section className="passport" aria-label="Passport">
      <div className="ps-head">
        <h3 className="section-title">The passport</h3>
        <span className="ps-sub">
          {stamps.length} countries, in the order they were first stamped — {stamps[0].country} to {stamps[stamps.length - 1].country}
        </span>
      </div>
      <div className="ps-page">
        <ul className="ps-stamps">
          {stamps.map((s) => (
            <StampMark key={s.country} stamp={s} selected={s.country === selected} onSelect={onSelect} />
          ))}
        </ul>
      </div>
      <p className="ps-note">Dated by the first game bought in each country. Press a stamp for its games.</p>
    </section>
  );
}
