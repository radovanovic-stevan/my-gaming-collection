import { useEffect, useState } from 'react';
import type { ChecklistItem, ChecklistSeries } from '../types';
import { api } from '../lib/api';

interface Props {
  slug: string;
  /** Series to edit, or null to add one. */
  series: ChecklistSeries | null;
  onSaved: (saved: ChecklistSeries) => void;
  onAdded: (created: ChecklistSeries) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}

/** "1-5, 8, 10-12" → [1,2,3,4,5,8,10,11,12]. Throws on anything else. */
function parseNumbers(text: string): number[] {
  const out: number[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = token.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!m) throw new Error(`"${token}" isn't a number or a range like 10-20`);
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (to < from) throw new Error(`${token} runs backwards`);
    if (to - from > 5000) throw new Error(`${token} is too long a range`);
    for (let n = from; n <= to; n++) out.push(n);
  }
  return out;
}

/** [1,2,3,5] → "1-3, 5". */
function formatNumbers(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    runs.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return runs.join(', ');
}

const numbersOf = (items: ChecklistItem[], owned: boolean) => items.filter((i) => i.owned === owned).map((i) => Number(i.label));

export function SeriesEditor({ slug, series, onSaved, onAdded, onDeleted, onClose }: Props) {
  const [name, setName] = useState(series?.name ?? '');
  const [kind, setKind] = useState<ChecklistSeries['kind']>(series?.kind ?? 'numbers');
  const numbered = series?.kind !== 'titles' ? (series?.items ?? []) : [];
  const [owned, setOwned] = useState(formatNumbers(numbersOf(numbered, true)));
  const [missing, setMissing] = useState(formatNumbers(numbersOf(numbered, false)));
  const [titles, setTitles] = useState<ChecklistItem[]>(series?.kind === 'titles' && series.items.length ? series.items : [{ label: '', owned: false }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = (): ChecklistItem[] => {
    if (kind === 'titles') return titles.filter((t) => t.label.trim());
    const have = parseNumbers(owned);
    const want = parseNumbers(missing);
    const both = have.find((n) => want.includes(n));
    if (both !== undefined) throw new Error(`#${both} is listed as both owned and missing`);
    return [...have.map((n) => ({ label: String(n), owned: true })), ...want.map((n) => ({ label: String(n), owned: false }))];
  };

  let count: { owned: number; total: number } | null = null;
  try {
    const all = items();
    count = { owned: all.filter((i) => i.owned).length, total: all.length };
  } catch {
    // Shown as an error when saving.
  }

  const updateTitle = (i: number, patch: Partial<ChecklistItem>) => setTitles((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name, kind, items: items() };
      if (series) onSaved(await api.updateSeries(slug, series.id, body));
      else onAdded(await api.addSeries(slug, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!series || !confirm(`Delete "${series.name}" and all its issues?`)) return;
    try {
      await api.deleteSeries(slug, series.id);
      onDeleted(series.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={series ? 'Edit series' : 'Add series'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{series ? 'Edit series' : 'Add a series'}</h2>

        <div className="editor-row">
          <label className="field grow">
            <span>Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regularna Edicija" autoFocus={!series} />
          </label>
          <label className="field">
            <span>Issues are</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ChecklistSeries['kind'])}>
              <option value="numbers">Numbered</option>
              <option value="titles">Named books</option>
            </select>
          </label>
          <div className="field">
            <span>Owned</span>
            <output className="computed">{count ? `${count.owned} / ${count.total}` : '–'}</output>
          </div>
        </div>

        {kind === 'numbers' ? (
          <fieldset className="editor-section">
            <legend>Issues</legend>
            <p className="muted small">Numbers and ranges, separated by commas: 1-10, 12, 15-20. A new issue goes in one of the two lists.</p>
            <label className="field">
              <span>Owned</span>
              <textarea rows={3} value={owned} onChange={(e) => setOwned(e.target.value)} placeholder="1-10, 12" />
            </label>
            <label className="field">
              <span>Missing</span>
              <textarea rows={3} value={missing} onChange={(e) => setMissing(e.target.value)} placeholder="11, 13-15" />
            </label>
          </fieldset>
        ) : (
          <fieldset className="editor-section">
            <legend>Books</legend>
            <ol className="played-rows">
              {titles.map((t, i) => (
                <li key={i} className="played-row title-row">
                  <input type="checkbox" checked={t.owned} onChange={(e) => updateTitle(i, { owned: e.target.checked })} aria-label="Owned" title="Owned" />
                  <input value={t.label} onChange={(e) => updateTitle(i, { label: e.target.value })} placeholder="Title" autoFocus={i === titles.length - 1 && i > 0 && !t.label} />
                  <button type="button" className="icon-btn" onClick={() => setTitles((ts) => ts.filter((_, j) => j !== i))} title="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="btn" onClick={() => setTitles((ts) => [...ts, { label: '', owned: false }])}>
              + Add book
            </button>
          </fieldset>
        )}

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {series && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete series
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : series ? 'Save changes' : 'Add series'}
          </button>
        </div>
      </form>
    </div>
  );
}
