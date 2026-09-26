import { useEffect, useRef, useState } from 'react';
import type { Game, GalleryEntry, GameRef } from '../types';
import { api } from '../lib/api';
import { imageUrl } from '../lib/format';
import { toImageDataUrl } from '../lib/image';
import { GamePicker, type PickerValue } from './GamePicker';

interface Props {
  /** Picture to edit, or null to add one. */
  entry: GalleryEntry | null;
  games: Game[];
  link: (ref: GameRef) => Game | null;
  onSaved: (saved: GalleryEntry) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}

/** Photos get a little more room than covers. */
const MAX_SIDE = 1600;
const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());
const today = () => new Date().toISOString().slice(0, 10);

export function GalleryEditor({ entry, games, link, onSaved, onDeleted, onClose }: Props) {
  // A newly chosen picture, as a resized data URL; the saved one is shown until then.
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [date, setDate] = useState(entry ? (entry.date ?? '') : today());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [rows, setRows] = useState<PickerValue[]>(entry?.games.length ? entry.games.map((g) => ({ ...g })) : []);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (getBlob: () => Promise<Blob>) => {
    setError(null);
    setBusy('Loading picture…');
    try {
      setDataUrl(await toImageDataUrl(await getBlob(), MAX_SIDE));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const pickFile = (files: Iterable<File>) => {
    const file = [...files].find((f) => f.type.startsWith('image/'));
    if (file) pick(async () => file);
  };

  // Paste a picture (or an image URL) while the editor is open; Escape closes it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        pickFile(files);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (isHttpUrl(text) && !(e.target as HTMLElement).closest('input, textarea')) setUrl(text.trim());
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) return pickFile(e.dataTransfer.files);
    const dropped = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (isHttpUrl(dropped)) pick(() => api.fetchImage(dropped.trim()));
  };

  const updateRow = (i: number, v: PickerValue) => setRows((rs) => rs.map((r, j) => (j === i ? v : r)));
  const preview = dataUrl ?? (entry ? imageUrl(entry.image) : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return setError('Add a picture first.');
    setBusy('Saving…');
    setError(null);
    const input = {
      date: date || null,
      description,
      games: rows.filter((r) => r.title.trim()).map((r) => ({ title: r.title, platform: r.platform })),
      ...(dataUrl ? { dataUrl } : {}),
    };
    try {
      onSaved(entry ? await api.updatePicture(entry.id, input) : await api.addPicture(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!entry || !confirm('Delete this picture from the gallery?')) return;
    try {
      await api.deletePicture(entry.id);
      onDeleted(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={entry ? 'Edit picture' : 'Add picture'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{entry ? 'Edit picture' : 'Add a picture'}</h2>

        <div
          className={`dropzone picture-drop ${dragging ? 'dragging' : ''} ${preview ? 'has-picture' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
        >
          {preview && <img src={preview} alt="" />}
          <b>{preview ? 'Replace the picture' : 'Drop a picture here'}</b>
          <span>or click to choose a file · or paste with ⌘V</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              if (e.target.files) pickFile(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <div className="url-row">
          <input type="url" placeholder="…or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="btn" disabled={!isHttpUrl(url) || busy !== null} onClick={() => pick(() => api.fetchImage(url.trim())).then(() => setUrl(''))}>
            Fetch
          </button>
        </div>

        <div className="editor-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's in the picture?" />
        </label>

        <fieldset className="editor-section">
          <legend>Games in the picture</legend>
          {rows.length > 0 && (
            <ol className="played-rows">
              {rows.map((r, i) => (
                <li key={i} className="played-row">
                  <GamePicker value={r} onChange={(v) => updateRow(i, v)} games={games} link={link} autoFocus={!r.title} />
                  <div className="row-actions">
                    <button type="button" className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} title="Remove">
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { title: '', platform: '' }])}>
            + Add game
          </button>
        </fieldset>

        {busy && <p className="muted">{busy}</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {entry && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete picture
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy !== null || !preview}>
            {busy === 'Saving…' ? 'Saving…' : entry ? 'Save changes' : 'Add picture'}
          </button>
        </div>
      </form>
    </div>
  );
}
