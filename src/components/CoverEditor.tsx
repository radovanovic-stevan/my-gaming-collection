import { useEffect, useRef, useState } from 'react';
import type { Game } from '../types';
import { api } from '../lib/api';
import { toCoverDataUrl } from '../lib/image';
import { Cover } from './Cover';

interface Props {
  game: Game;
  onSaved: (game: Game) => void;
  onClose: () => void;
}

export function CoverEditor({ game, onSaved, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (getBlob: () => Promise<Blob>) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.setCover(game.id, await toCoverDataUrl(await getBlob()));
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Paste an image from the clipboard anywhere while the dialog is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        upload(async () => file);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (/^https?:\/\//.test(text) && !(e.target as HTMLElement).closest('input')) setUrl(text.trim());
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
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) return upload(async () => file);
    const link = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (/^https?:\/\//.test(link)) upload(() => api.fetchImage(link.trim()));
  };

  const remove = async () => {
    setBusy(true);
    try {
      onSaved(await api.removeCover(game.id));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const searchQuery = encodeURIComponent(`${game.title} ${game.platform} cover`);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cover-editor" role="dialog" aria-modal="true" aria-label="Cover art" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Cover · {game.title}</h2>

        <div className="cover-editor-body">
          <div className="cover-editor-preview">
            <Cover game={game} eager />
          </div>

          <div className="cover-editor-inputs">
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
            >
              <b>Drop an image here</b>
              <span>or click to choose a file · or paste with ⌘V</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(async () => file);
                }}
              />
            </div>

            <form
              className="url-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) upload(() => api.fetchImage(url.trim()));
              }}
            >
              <input type="url" placeholder="…or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="btn primary" disabled={!url.trim() || busy}>
                Fetch
              </button>
            </form>

            <p className="muted small">
              Find one:{' '}
              <a href={`https://www.google.com/search?tbm=isch&q=${searchQuery}`} target="_blank" rel="noreferrer">
                Google Images
              </a>{' '}
              ·{' '}
              <a href={`https://www.mobygames.com/search/?q=${encodeURIComponent(game.title)}`} target="_blank" rel="noreferrer">
                MobyGames
              </a>{' '}
              ·{' '}
              <a href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(game.title + ' video game')}`} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            </p>
            <p className="muted small">Images are resized to 600px wide and saved to public/covers.</p>

            {busy && <p className="muted">Saving…</p>}
            {error && <p className="error">{error}</p>}

            {game.cover && (
              <button className="btn danger" onClick={remove} disabled={busy}>
                Remove cover
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
