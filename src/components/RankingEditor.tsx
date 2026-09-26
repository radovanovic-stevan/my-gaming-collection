import { useEffect, useState } from 'react';
import type { AwardValue, Game, GameRef, GotcData } from '../types';
import { api } from '../lib/api';
import { isGameRef } from '../lib/links';
import { GamePicker, type PickerValue } from './GamePicker';

type AllTime = GotcData['allTime'];

interface Props {
  allTime: AllTime;
  /** Index of the category to edit, or null to add one. */
  index: number | null;
  games: Game[];
  link: (ref: GameRef) => Game | null;
  onSaved: (allTime: AllTime) => void;
  onClose: () => void;
}

const SLOTS = 5;
const toPicker = (v: AwardValue | undefined): PickerValue => (!v ? { title: '', platform: '' } : isGameRef(v) ? { ...v } : { title: v.text, platform: '' });

export function RankingEditor({ allTime, index, games, link, onSaved, onClose }: Props) {
  const current = index === null ? null : allTime[index];
  const [category, setCategory] = useState(current?.category ?? '');
  const [slots, setSlots] = useState<PickerValue[]>(() => Array.from({ length: SLOTS }, (_, i) => toPicker(current?.ranking[i])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = (i: number, d: number) =>
    setSlots((ss) => {
      const next = [...ss];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const save = async (next: AllTime) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.saveAllTime(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ranking = slots
      .filter((s) => s.title.trim())
      .map((s): AwardValue => (s.platform.trim() ? { title: s.title, platform: s.platform } : { text: s.title }));
    const entry = { category, ranking };
    save(index === null ? [...allTime, entry] : allTime.map((c, i) => (i === index ? entry : c)));
  };

  const remove = () => {
    if (index !== null && confirm(`Delete the "${category}" ranking?`)) save(allTime.filter((_, i) => i !== index));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label="Edit ranking">
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{current ? 'Edit ranking' : 'Add a ranking'}</h2>

        <label className="field">
          <span>Category</span>
          <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Games Acquired 2026" autoFocus={!current} />
        </label>

        <fieldset className="editor-section">
          <legend>Top {SLOTS}</legend>
          <ol className="played-rows">
            {slots.map((s, i) => (
              <li key={i} className="played-row ranked">
                <span className="rank">{i + 1}</span>
                <GamePicker value={s} onChange={(v) => setSlots((ss) => ss.map((x, j) => (j === i ? v : x)))} games={games} link={link} />
                <div className="row-actions">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                    ⌃
                  </button>
                  <button type="button" className="icon-btn" disabled={i === SLOTS - 1} onClick={() => move(i, 1)} title="Move down">
                    ⌄
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {current && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              Delete ranking
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : current ? 'Save changes' : 'Add ranking'}
          </button>
        </div>
      </form>
    </div>
  );
}
