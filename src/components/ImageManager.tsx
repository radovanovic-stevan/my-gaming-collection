import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WithImages } from '../types';
import { api } from '../lib/api';
import { toImageDataUrl } from '../lib/image';
import { imageUrl } from '../lib/format';

/** The API calls for one kind of item; each returns the updated item. */
export interface ImageOps<T> {
  add: (id: number, dataUrl: string) => Promise<T>;
  remove: (id: number, file: string) => Promise<T>;
  setCover: (id: number, file: string) => Promise<T>;
}

interface Props<T extends WithImages> {
  item: T;
  /** Shown in the heading. */
  title: string;
  ops: ImageOps<T>;
  /** Links to places to find pictures. */
  findLinks: ReactNode;
  onSaved: (item: T) => void;
  onClose: () => void;
}

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());

export function ImageManager<T extends WithImages>({ item, title, ops, findLinks, onSaved, onClose }: Props<T>) {
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  /** Uploads images one after another; the server makes the first image of an item its cover. */
  const upload = async (sources: (() => Promise<Blob>)[]) => {
    if (!sources.length || busy) return;
    setError(null);
    const failures: string[] = [];
    for (const [i, getBlob] of sources.entries()) {
      setProgress(sources.length > 1 ? `Adding ${i + 1} of ${sources.length}…` : 'Adding…');
      try {
        onSaved(await ops.add(item.id, await toImageDataUrl(await getBlob())));
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
    }
    setProgress(null);
    if (failures.length) setError(failures.join(' · '));
  };

  const uploadFiles = (files: Iterable<File>) =>
    upload([...files].filter((f) => f.type.startsWith('image/')).map((f) => async () => f));

  const run = async (action: () => Promise<T>) => {
    setError(null);
    setProgress('Saving…');
    try {
      onSaved(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  // Paste images (or an image URL) from the clipboard while the dialog is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        uploadFiles(files);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (isHttpUrl(text) && !(e.target as HTMLElement).closest('input')) setUrl(text.trim());
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
    if (e.dataTransfer.files.length) return uploadFiles(e.dataTransfer.files);
    const link = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (isHttpUrl(link)) upload([() => api.fetchImage(link.trim())]);
  };

  const remove = (file: string) => {
    if (confirm(file === item.cover ? 'Delete the cover image? The next image becomes the cover.' : 'Delete this image?')) {
      run(() => ops.remove(item.id, file));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-manager" role="dialog" aria-modal="true" aria-label="Images" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Images · {title}</h2>

        {item.images.length > 0 ? (
          <ul className="image-list">
            {item.images.map((file) => {
              const isCover = file === item.cover;
              return (
                <li key={file} className={isCover ? 'is-cover' : ''}>
                  <img src={imageUrl(file)} alt="" loading="lazy" />
                  {isCover && <span className="cover-tag">★ Cover</span>}
                  <div className="image-actions">
                    {!isCover && (
                      <button className="btn" disabled={busy} onClick={() => run(() => ops.setCover(item.id, file))}>
                        Make cover
                      </button>
                    )}
                    <button className="btn danger" disabled={busy} onClick={() => remove(file)} aria-label="Delete image">
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No images yet. The first one you add becomes the cover.</p>
        )}

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
          <b>Drop images here</b>
          <span>or click to choose files · or paste with ⌘V</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <form
          className="url-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (isHttpUrl(url)) upload([() => api.fetchImage(url.trim())]).then(() => setUrl(''));
          }}
        >
          <input type="url" placeholder="…or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn primary" disabled={!isHttpUrl(url) || busy}>
            Fetch
          </button>
        </form>

        <p className="muted small">
          Find one: {findLinks}. Images are resized to 1200px and saved to public/images.
        </p>

        {progress && <p className="muted">{progress}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
