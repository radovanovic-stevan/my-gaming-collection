import { useState } from 'react';
import { api } from '../lib/api';

interface Props {
  /** The year being written down, e.g. 2026. */
  year: number;
  notes: string[];
  onSaved: (notes: string[]) => void;
}

/**
 * Moments worth an award, written down while the year is still going, so Moment of the Year doesn't have to be
 * remembered from scratch in January. Local editing only: the published site never renders these.
 */
export function MomentNotes({ year, notes, onSaved }: Props) {
  const saved = notes.join('\n');
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== saved;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { notes: next } = await api.saveNotes(year, text.split('\n'));
      setText(next.join('\n'));
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="moment-notes stat-block">
      <h4>Moments to remember · {year}</h4>
      <p className="muted small">One per line. Local editing only; the site never shows them.</p>
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Something from ${year} worth an award…`}
        aria-label={`Moments to remember in ${year}`}
      />
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn primary" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : dirty ? 'Save notes' : 'Saved'}
        </button>
      </div>
    </section>
  );
}
