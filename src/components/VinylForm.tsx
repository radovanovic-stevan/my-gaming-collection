import { useEffect, useState } from 'react';
import type { Vinyl } from '../types';
import { api } from '../lib/api';

interface Props {
  /** Record to edit, or null to add one. */
  record: Vinyl | null;
  onSaved: (record: Vinyl) => void;
  onClose: () => void;
}

/** Artist and album. Listens are logged on the record itself. */
export function VinylForm({ record, onSaved, onClose }: Props) {
  const [artist, setArtist] = useState(record?.artist ?? '');
  const [title, setTitle] = useState(record?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = { artist, title, listens: record?.listens ?? [] };
      onSaved(record ? await api.updateVinyl(record.id, input) : await api.addVinyl(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={record ? 'Edit record' : 'Add record'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{record ? 'Edit record' : 'Add a record'}</h2>
        <div className="editor-row">
          <label className="field grow">
            <span>Artist</span>
            <input required value={artist} onChange={(e) => setArtist(e.target.value)} autoFocus />
          </label>
          <label className="field grow">
            <span>Album</span>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        {!record && <p className="muted small">Next you can add pictures. The first one becomes the cover.</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : record ? 'Save changes' : 'Add record'}
          </button>
        </div>
      </form>
    </div>
  );
}
