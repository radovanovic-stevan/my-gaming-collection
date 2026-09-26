import { useMemo, useState } from 'react';
import type { Game, GameRef, GotmMonth } from '../types';
import { PLAY_STATUS, RefCover, RefTitle, StatusEmoji } from './GameRefView';
import { MonthEditor } from './MonthEditor';

interface Props {
  months: GotmMonth[];
  link: (ref: GameRef) => Game | null;
  onOpen: (game: Game) => void;
  /** Local editing (dev server only). */
  editable: boolean;
  games: Game[];
  onChange: (months: GotmMonth[]) => void;
}

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const formatMonth = (yyyyMm: string) => monthName.format(new Date(`${yyyyMm}-01T00:00:00`));

export function GotmView({ months, link, onOpen, editable, games, onChange }: Props) {
  const years = useMemo(() => [...new Set(months.map((m) => m.month.slice(0, 4)))], [months]);
  const [year, setYear] = useState(years[0]);
  // undefined: closed; null: adding a month; otherwise the month being edited.
  const [editing, setEditing] = useState<GotmMonth | null | undefined>(undefined);

  const onSaved = (saved: GotmMonth, previousKey: string | null) => {
    const rest = months.filter((m) => m.month !== saved.month && m.month !== previousKey);
    onChange([...rest, saved].sort((a, b) => b.month.localeCompare(a.month)));
    setYear(saved.month.slice(0, 4));
    setEditing(undefined);
  };
  const onDeleted = (key: string) => {
    onChange(months.filter((m) => m.month !== key));
    setEditing(undefined);
  };
  const shown = months.filter((m) => m.month.startsWith(year));

  const totals = useMemo(() => {
    const played = new Set<string>();
    for (const m of shown) for (const g of [m.gameOfTheMonth, ...m.played]) if (g) played.add(`${g.title}|${g.platform}`);
    return {
      completed: shown.reduce((s, m) => s + (m.completed ?? 0), 0),
      bought: shown.reduce((s, m) => s + (m.bought ?? 0), 0),
      played: played.size,
    };
  }, [shown]);

  return (
    <section className="awards">
      <div className="awards-head">
        <div>
          <h2>Game of the Month</h2>
          <p className="muted">Everything played each month, what got finished, what got bought, and the month's favourite.</p>
        </div>
        <div className="awards-actions">
          <div className="year-picker" role="group" aria-label="Year">
            {years.map((y) => (
              <button key={y} className={`chip ${y === year ? 'on' : ''}`} aria-pressed={y === year} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          {editable && (
            <button className="btn primary" onClick={() => setEditing(null)}>
              + Add month
            </button>
          )}
        </div>
      </div>

      <div className="year-totals">
        <div>
          <b>{totals.completed}</b>
          <span>completed</span>
        </div>
        <div>
          <b>{totals.bought}</b>
          <span>bought</span>
        </div>
        <div>
          <b>{totals.played}</b>
          <span>different games played</span>
        </div>
        <div>
          <b>{shown.length}</b>
          <span>{shown.length === 1 ? 'month' : 'months'}</span>
        </div>
      </div>

      <p className="legend muted">
        {Object.values(PLAY_STATUS).map((s) => (
          <span key={s.emoji}>
            {s.emoji} {s.label}
          </span>
        ))}
      </p>

      <ul className="month-grid">
        {shown.map((m) => {
          const gotm = m.gameOfTheMonth;
          const gotmGame = gotm && link(gotm);
          return (
            <li key={m.month} className="month-card">
              <header className="month-card-head">
                <h3>{formatMonth(m.month)}</h3>
                {m.gameOfTheMonth ? (
                  <span className="muted">
                    <b>{m.completed ?? 0}</b> completed · <b>{m.bought ?? 0}</b> bought
                  </span>
                ) : (
                  <span className="muted">In progress{m.bought ? ` · ${m.bought} bought` : ''}</span>
                )}
                {editable && (
                  <button className="link card-edit" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                )}
              </header>

              {gotm && (
                <div className="gotm-hero">
                  <button className="gotm-cover" onClick={() => gotmGame && onOpen(gotmGame)} disabled={!gotmGame} aria-label={gotm.title}>
                    <RefCover entry={gotm} game={gotmGame} />
                  </button>
                  <div className="gotm-info">
                    <span className="eyebrow">🏆 Game of the Month</span>
                    <RefTitle entry={gotm} game={gotmGame} onOpen={onOpen} />
                    {gotm.status && (
                      <span className="muted small">
                        <StatusEmoji status={gotm.status} /> {PLAY_STATUS[gotm.status].label}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {m.played.length > 0 && (
                <ul className="played-list">
                  {m.played.map((g, i) => (
                    <li key={`${g.title}|${g.platform}|${i}`}>
                      <StatusEmoji status={g.status} />
                      <RefTitle entry={g} game={link(g)} onOpen={onOpen} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {editing !== undefined && (
        <MonthEditor month={editing} months={months} games={games} link={link} onSaved={onSaved} onDeleted={onDeleted} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}
