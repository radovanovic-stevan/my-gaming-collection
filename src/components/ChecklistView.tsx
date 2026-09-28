import { useState } from 'react';
import type { ChecklistCollection, ChecklistSeries } from '../types';
import { api } from '../lib/api';
import { SeriesEditor } from './SeriesEditor';

interface Props {
  /** File and API name of the collection, e.g. "dylan-dog". */
  slug: string;
  data: ChecklistCollection;
  /** Local editing (dev server only). */
  editable: boolean;
  onChange: (data: ChecklistCollection) => void;
}

type Show = 'all' | 'owned' | 'missing';

export function ChecklistView({ slug, data, editable, onChange }: Props) {
  const [show, setShow] = useState<Show>('all');
  // In ticking mode a click on an issue marks it owned or missing and saves straight away.
  const [ticking, setTicking] = useState(false);
  // undefined: closed; null: adding a series; otherwise the series being edited.
  const [editing, setEditing] = useState<ChecklistSeries | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const replace = (saved: ChecklistSeries, position?: number) => {
    const rest = data.series.filter((s) => s.id !== saved.id);
    const at = position ?? data.series.findIndex((s) => s.id === saved.id);
    rest.splice(at < 0 ? rest.length : at, 0, saved);
    onChange({ ...data, series: rest });
  };

  /** Shows the change at once and puts the old state back if saving fails. */
  const save = async (next: ChecklistSeries, position?: number) => {
    const before = data;
    replace(next, position);
    setError(null);
    try {
      await api.updateSeries(slug, next.id, { name: next.name, kind: next.kind, items: next.items, position });
    } catch (e) {
      onChange(before);
      setError(`Couldn't save ${next.name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  const toggle = (series: ChecklistSeries, label: string) =>
    save({ ...series, items: series.items.map((i) => (i.label === label ? { ...i, owned: !i.owned } : i)) });

  const addNext = (series: ChecklistSeries) => {
    const next = Math.max(0, ...series.items.map((i) => Number(i.label))) + 1;
    save({ ...series, items: [...series.items, { label: String(next), owned: true }] });
  };

  const move = (series: ChecklistSeries, d: number) => save(series, data.series.findIndex((s) => s.id === series.id) + d);

  const onSaved = (saved: ChecklistSeries) => {
    replace(saved);
    setEditing(undefined);
  };
  const onDeleted = (id: number) => {
    onChange({ ...data, series: data.series.filter((s) => s.id !== id) });
    setEditing(undefined);
  };

  return (
    <section className="awards checklist">
      <div className="awards-head">
        <p className="legend muted">
          <span>
            <span className="issue owned swatch">1</span> owned
          </span>
          <span>
            <span className="issue swatch">1</span> missing
          </span>
        </p>
        <div className="awards-actions">
          <div className="segmented" role="group" aria-label="Show">
            {(['all', 'owned', 'missing'] as const).map((s) => (
              <button key={s} className={show === s ? 'on' : ''} aria-pressed={show === s} onClick={() => setShow(s)}>
                {s === 'all' ? 'All' : s === 'owned' ? 'Owned' : 'Missing'}
              </button>
            ))}
          </div>
          {editable && (
            <>
              <button className={`btn ${ticking ? 'on' : ''}`} aria-pressed={ticking} onClick={() => setTicking(!ticking)} title="Click issues to mark them owned or missing">
                {ticking ? 'Done' : 'Tick off issues'}
              </button>
              <button className="btn primary" onClick={() => setEditing(null)}>
                + Add series
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {ticking && <p className="legend muted">Click an issue to switch it between owned and missing, or + to add the next number. Changes are saved as you go.</p>}

      <ul className="series-grid">
        {data.series.map((s, index) => {
          const owned = s.items.filter((i) => i.owned).length;
          const items = s.items.filter((i) => show === 'all' || i.owned === (show === 'owned'));
          const pct = s.items.length ? (owned / s.items.length) * 100 : 0;
          return (
            <li key={s.id} className="series-card">
              <header className="series-head">
                <h3>{s.name}</h3>
                <span className="muted nowrap">
                  <b>{owned}</b> / {s.items.length}
                </span>
                {editable && (
                  <span className="series-tools">
                    {ticking && (
                      <>
                        <button className="icon-btn" disabled={index === 0} onClick={() => move(s, -1)} title="Move up">
                          ⌃
                        </button>
                        <button className="icon-btn" disabled={index === data.series.length - 1} onClick={() => move(s, 1)} title="Move down">
                          ⌄
                        </button>
                      </>
                    )}
                    <button className="link" onClick={() => setEditing(s)}>
                      Edit
                    </button>
                  </span>
                )}
              </header>
              <div className="series-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} progress`}>
                <span style={{ width: `${pct}%` }} />
              </div>

              {items.length === 0 && !(ticking && s.kind === 'numbers') ? (
                <p className="muted small">{show === 'missing' ? 'Nothing missing.' : show === 'owned' ? 'None yet.' : 'No issues yet.'}</p>
              ) : s.kind === 'numbers' ? (
                <ol className="issue-grid">
                  {items.map((i) =>
                    ticking ? (
                      <li key={i.label}>
                        <button className={`issue ${i.owned ? 'owned' : ''}`} aria-pressed={i.owned} onClick={() => toggle(s, i.label)}>
                          {i.label}
                        </button>
                      </li>
                    ) : (
                      <li key={i.label} className={`issue ${i.owned ? 'owned' : ''}`} title={i.owned ? 'Owned' : 'Missing'}>
                        {i.label}
                      </li>
                    ),
                  )}
                  {ticking && (
                    <li>
                      <button className="issue add" onClick={() => addNext(s)} title="Add the next issue as owned">
                        +
                      </button>
                    </li>
                  )}
                </ol>
              ) : (
                <ul className="title-list">
                  {items.map((i) => (
                    <li key={i.label} className={i.owned ? 'owned' : ''}>
                      {ticking ? (
                        <button className="title-toggle" aria-pressed={i.owned} onClick={() => toggle(s, i.label)}>
                          <span className="tick">{i.owned ? '✓' : ''}</span>
                          {i.label}
                        </button>
                      ) : (
                        <>
                          <span className="tick">{i.owned ? '✓' : ''}</span>
                          {i.label}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {editing !== undefined && (
        <SeriesEditor slug={slug} series={editing} onSaved={onSaved} onAdded={(s) => (onChange({ ...data, series: [...data.series, s] }), setEditing(undefined))} onDeleted={onDeleted} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}
