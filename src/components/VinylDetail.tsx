import { useEffect, useRef, useState } from 'react';
import type { Vinyl, VinylListen } from '../types';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Gallery } from './Gallery';
import { VinylCover } from './VinylView';

interface Props {
  record: Vinyl;
  /** Local editing (dev server only). */
  editable: boolean;
  onSaved: (record: Vinyl) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onEdit: () => void;
  onImages: () => void;
  onDelete: () => void;
}

const SIDES = ['1', '2', '3', '4', 'A', 'B', 'C', 'D', 'E', 'F'];
const today = () => new Date().toISOString().slice(0, 10);

/** The sides this record has been played on, or 1 and 2 for one that hasn't been played yet. */
const sidesOf = (listens: VinylListen[]) => {
  const used = [...new Set(listens.map((l) => l.side))].sort();
  return used.length ? used : ['1', '2'];
};

export function VinylDetail({ record, editable, onSaved, onClose, onPrev, onNext, onEdit, onImages, onDelete }: Props) {
  // Edited here and saved as you go; saves run one after another so the last change always wins.
  const [listens, setListens] = useState(record.listens);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    setListens(record.listens);
    setError(null);
  }, [record.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const save = (next: VinylListen[]) => {
    setListens(next);
    setError(null);
    queue.current = queue.current.then(() =>
      api.updateVinyl(record.id, { artist: record.artist, title: record.title, listens: next }).then(onSaved, (e) => {
        setError(`Couldn't save: ${e instanceof Error ? e.message : e}`);
      }),
    );
  };
  const update = (i: number, patch: Partial<VinylListen>) => save(listens.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const dated = listens.filter((l) => l.date).map((l) => l.date!);
  const last = dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null;
  const undated = listens.length - dated.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail vinyl-detail" role="dialog" aria-modal="true" aria-label={record.title} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="detail-cover">
          <Gallery item={record} placeholder={<VinylCover record={record} />} />
        </div>
        <div className="detail-info">
          <span className="eyebrow">{record.artist}</span>
          <h2 className="detail-title">{record.title}</h2>
          <dl className="detail-list">
            <div>
              <dt>Sides played</dt>
              <dd>{listens.length}</dd>
            </div>
            <div>
              <dt>Last played</dt>
              <dd>{formatDate(last)}</dd>
            </div>
          </dl>

          <div className="listen-log">
            <h3 className="section-title">
              Listening log
              {undated > 0 && <span className="muted"> · {undated} without a date</span>}
            </h3>
            {listens.length === 0 ? (
              <p className="muted small">Not played yet.</p>
            ) : (
              <ol className="listen-rows">
                {listens.map((l, i) =>
                  editable ? (
                    <li key={i} className="listen-row">
                      <select value={l.side} onChange={(e) => update(i, { side: e.target.value })} aria-label="Side">
                        {[...new Set([...SIDES, l.side])].map((s) => (
                          <option key={s} value={s}>
                            Side {s}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className={l.date ? '' : 'undated'}
                        value={l.date ?? ''}
                        max={today()}
                        onChange={(e) => (e.target.value === '' || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) && update(i, { date: e.target.value || null })}
                        aria-label={`Date of listen ${i + 1}`}
                      />
                      <button className="icon-btn" onClick={() => save(listens.filter((_, j) => j !== i))} title="Remove this listen">
                        ×
                      </button>
                    </li>
                  ) : (
                    <li key={i} className="listen-row">
                      <span className="side-tag">Side {l.side}</span>
                      <span className={l.date ? '' : 'muted'}>{l.date ? formatDate(l.date) : 'No date'}</span>
                    </li>
                  ),
                )}
              </ol>
            )}
            {editable && (
              <div className="log-actions">
                <span className="muted small">Played today:</span>
                {sidesOf(listens).map((s) => (
                  <button key={s} className="btn" onClick={() => save([...listens, { side: s, date: today() }])}>
                    + Side {s}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>

          <div className="detail-actions">
            <div className="detail-nav">
              <button className="btn" onClick={onPrev} disabled={!onPrev}>
                ← Prev
              </button>
              <button className="btn" onClick={onNext} disabled={!onNext}>
                Next →
              </button>
            </div>
            {editable && (
              <div className="detail-nav">
                <button className="btn" onClick={onImages}>
                  Images{record.images.length ? ` (${record.images.length})` : ''}
                </button>
                <button className="btn" onClick={onEdit}>
                  Edit
                </button>
                <button className="btn danger" onClick={onDelete}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
