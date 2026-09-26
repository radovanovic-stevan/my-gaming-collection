import { useEffect, useState } from 'react';
import type { Game, GameRef, GotmMonth, PlayStatus } from '../types';
import { api } from '../lib/api';
import { GamePicker } from './GamePicker';
import { PLAY_STATUS } from './GameRefView';

interface Props {
  /** Month to edit, or null to add one. */
  month: GotmMonth | null;
  months: GotmMonth[];
  games: Game[];
  link: (ref: GameRef) => Game | null;
  onSaved: (saved: GotmMonth, previousKey: string | null) => void;
  onDeleted: (key: string) => void;
  onClose: () => void;
}

interface Row {
  title: string;
  platform: string;
  status: PlayStatus | '';
}

const emptyRow = (): Row => ({ title: '', platform: '', status: 'in-progress' });

/** The month after the latest one on file (or the current month). */
function nextMonth(months: GotmMonth[]): string {
  const latest = months[0]?.month;
  if (!latest) return new Date().toISOString().slice(0, 7);
  const [y, m] = latest.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function StatusSelect({ value, onChange }: { value: Row['status']; onChange: (v: Row['status']) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Row['status'])} aria-label="Status">
      <option value="">· Not marked</option>
      {(Object.keys(PLAY_STATUS) as PlayStatus[]).map((s) => (
        <option key={s} value={s}>
          {PLAY_STATUS[s].emoji} {PLAY_STATUS[s].label}
        </option>
      ))}
    </select>
  );
}

export function MonthEditor({ month, months, games, link, onSaved, onDeleted, onClose }: Props) {
  const [key, setKey] = useState(month?.month ?? nextMonth(months));
  const [gotm, setGotm] = useState<Row>(
    month?.gameOfTheMonth ? { ...month.gameOfTheMonth, status: month.gameOfTheMonth.status ?? '' } : { title: '', platform: '', status: 'completed' },
  );
  const [bought, setBought] = useState(month?.bought?.toString() ?? '');
  const [rows, setRows] = useState<Row[]>(month?.played.length ? month.played.map((g) => ({ ...g, status: g.status ?? '' })) : [emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filled = rows.filter((r) => r.title.trim());
  const hasGotm = gotm.title.trim() !== '';
  const completed = [...(hasGotm ? [gotm] : []), ...filled].filter((r) => r.status === 'completed').length;

  const updateRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moveRow = (i: number, d: number) =>
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const toPlayed = (r: Row) => ({ title: r.title, platform: r.platform, status: r.status || null });
    try {
      const saved = await api.saveMonth(month?.month ?? key, {
        month: key,
        gameOfTheMonth: hasGotm ? toPlayed(gotm) : null,
        completed,
        bought: bought.trim() === '' ? null : Number(bought),
        played: filled.map(toPlayed),
      });
      onSaved(saved, month?.month ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!month || !confirm(`Delete ${month.month} and everything in it?`)) return;
    try {
      await api.deleteMonth(month.month);
      onDeleted(month.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={month ? 'Edit month' : 'Add month'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{month ? 'Edit month' : 'Add a month'}</h2>

        <div className="editor-row">
          <label className="field">
            <span>Month</span>
            <input type="month" required value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <label className="field">
            <span>Games bought</span>
            <input type="number" min={0} step={1} value={bought} onChange={(e) => setBought(e.target.value)} placeholder="0" />
          </label>
          <div className="field">
            <span>Games completed</span>
            <output className="computed" title="Counted from the ✅ games below, including the Game of the Month">
              {completed}
            </output>
          </div>
        </div>

        <fieldset className="editor-section gotm-section">
          <legend>🏆 Game of the Month</legend>
          <div className="played-row">
            <GamePicker value={gotm} onChange={(v) => setGotm({ ...gotm, ...v })} games={games} link={link} placeholder="Leave empty while the month is running" />
            <StatusSelect value={gotm.status} onChange={(status) => setGotm({ ...gotm, status })} />
          </div>
        </fieldset>

        <fieldset className="editor-section">
          <legend>Other games played</legend>
          <ol className="played-rows">
            {rows.map((r, i) => (
              <li key={i} className="played-row">
                <GamePicker value={r} onChange={(v) => updateRow(i, v)} games={games} link={link} autoFocus={i === rows.length - 1 && i > 0 && !r.title} />
                <StatusSelect value={r.status} onChange={(status) => updateRow(i, { status })} />
                <div className="row-actions">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveRow(i, -1)} title="Move up">
                    ⌃
                  </button>
                  <button type="button" className="icon-btn" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)} title="Move down">
                    ⌄
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} title="Remove">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            + Add game
          </button>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {month && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete month
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : month ? 'Save changes' : 'Add month'}
          </button>
        </div>
      </form>
    </div>
  );
}
