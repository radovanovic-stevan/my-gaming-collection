import { useMemo } from 'react';
import type { Game } from '../types';
import { dateKey } from '../lib/query';
import { formatMonthYear } from '../lib/format';

interface Props {
  games: Game[];
  /** yyyy-mm being shown. */
  value: string;
  onChange: (asOf: string) => void;
  onClose: () => void;
}

const addMonth = (yyyyMm: string, n: number) => {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Every month from the first game bought to this one. */
function useMonths(games: Game[]) {
  return useMemo(() => {
    const keys = games.map((g) => dateKey(g.acquired)).filter((k): k is string => !!k);
    const perMonth = new Map<string, number>();
    if (!keys.length) return { months: [] as string[], owned: [] as number[], perMonth };
    const now = new Date();
    const first = keys.reduce((a, b) => (a < b ? a : b)).slice(0, 7);
    const last = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const months: string[] = [];
    for (let m = first; m <= last; m = addMonth(m, 1)) months.push(m);
    // How many were owned by the end of each month, counted once.
    for (const k of keys) perMonth.set(k.slice(0, 7), (perMonth.get(k.slice(0, 7)) ?? 0) + 1);
    let running = 0;
    const owned = months.map((m) => (running += perMonth.get(m) ?? 0));
    return { months, owned, perMonth };
  }, [games]);
}

/** The collection as it stood in any month: drag back and everything bought later disappears. */
export function TimeMachine({ games, value, onChange, onClose }: Props) {
  const { months, owned, perMonth } = useMonths(games);
  if (!months.length) return null;

  const i = Math.max(0, months.indexOf(value));
  const arrived = perMonth.get(months[i]) ?? 0;
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];

  return (
    <div className="timemachine">
      <div className="tm-read">
        <b className="tm-month">{formatMonthYear(months[i])}</b>
        <span className="muted">
          {owned[i]} owned{arrived ? ` · ${arrived} arrived` : ''}
        </span>
      </div>
      <div className="tm-slider">
        <input
          type="range"
          min={0}
          max={months.length - 1}
          value={i}
          onChange={(e) => onChange(months[Number(e.target.value)])}
          aria-label="Month"
        />
        <div className="tm-years" aria-hidden="true">
          {years.map((y) => (
            <button key={y} className={months[i].startsWith(y) ? 'on' : ''} onClick={() => onChange(months.find((m) => m.startsWith(y)) ?? months[0])}>
              {y.slice(2)}
            </button>
          ))}
        </div>
      </div>
      <div className="tm-actions">
        <button className="btn" onClick={() => onChange(months[Math.max(0, i - 1)])} aria-label="Previous month">
          ‹
        </button>
        <button className="btn" onClick={() => onChange(months[Math.min(months.length - 1, i + 1)])} aria-label="Next month">
          ›
        </button>
        <button className="btn" onClick={onClose}>
          Now
        </button>
      </div>
    </div>
  );
}
