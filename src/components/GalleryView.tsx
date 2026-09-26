import { useEffect, useMemo, useState } from 'react';
import type { Game, GalleryEntry, GameRef } from '../types';
import { formatDate, imageUrl } from '../lib/format';
import { RefTitle } from './GameRefView';
import { GalleryEditor } from './GalleryEditor';

interface Props {
  entries: GalleryEntry[];
  link: (ref: GameRef) => Game | null;
  onOpen: (game: Game) => void;
  /** Local editing (dev server only). */
  editable: boolean;
  games: Game[];
  onChange: (entries: GalleryEntry[]) => void;
}

/** Newest pictures first; undated ones last. Same order the API saves them in. */
const sortEntries = (entries: GalleryEntry[]) => [...entries].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id);

function Viewer({ entries, index, onIndex, onClose, link, onOpen, onEdit }: {
  entries: GalleryEntry[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  link: Props['link'];
  onOpen: Props['onOpen'];
  onEdit?: (entry: GalleryEntry) => void;
}) {
  const entry = entries[index];
  const step = (d: number) => onIndex((index + d + entries.length) % entries.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && entries.length > 1) step(-1);
      else if (e.key === 'ArrowRight' && entries.length > 1) step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="lightbox picture-viewer" onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl(entry.image)} alt={entry.description || 'Gallery picture'} />
        <figcaption>
          <div className="picture-meta">
            <span className="muted">{entry.date ? formatDate(entry.date) : 'No date'}</span>
            {onEdit && (
              <button className="btn" onClick={() => onEdit(entry)}>
                Edit
              </button>
            )}
          </div>
          {entry.description && <p className="picture-description">{entry.description}</p>}
          {entry.games.length > 0 && (
            <ul className="plain-list picture-games">
              {entry.games.map((g) => (
                <li key={`${g.title}|${g.platform}`}>
                  <RefTitle entry={g} game={link(g)} onOpen={(game) => (onClose(), onOpen(game))} />
                </li>
              ))}
            </ul>
          )}
        </figcaption>
      </figure>
      {entries.length > 1 && (
        <>
          <button className="lightbox-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))} aria-label="Previous picture">
            ‹
          </button>
          <button className="lightbox-nav next" onClick={(e) => (e.stopPropagation(), step(1))} aria-label="Next picture">
            ›
          </button>
        </>
      )}
      <button className="lightbox-close icon-btn" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}

export function GalleryView({ entries, link, onOpen, editable, games, onChange }: Props) {
  // Index into `entries` of the picture shown full size.
  const [viewing, setViewing] = useState<number | null>(null);
  // undefined: closed; null: adding; otherwise the picture being edited.
  const [editing, setEditing] = useState<GalleryEntry | null | undefined>(undefined);

  const groups = useMemo(() => {
    const out: { title: string; items: { entry: GalleryEntry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
      const title = entry.date?.slice(0, 4) ?? 'Undated';
      if (out.at(-1)?.title !== title) out.push({ title, items: [] });
      out.at(-1)!.items.push({ entry, index });
    });
    return out;
  }, [entries]);

  const onSaved = (saved: GalleryEntry) => {
    const next = sortEntries([...entries.filter((e) => e.id !== saved.id), saved]);
    onChange(next);
    if (viewing !== null) setViewing(next.findIndex((e) => e.id === saved.id));
    setEditing(undefined);
  };
  const onDeleted = (id: number) => {
    onChange(entries.filter((e) => e.id !== id));
    setViewing(null);
    setEditing(undefined);
  };

  return (
    <section className="awards">
      <div className="awards-head">
        <div>
          <h2>Gallery</h2>
          <p className="muted">Pictures from the collection over the years.</p>
        </div>
        {editable && (
          <div className="awards-actions">
            <button className="btn primary" onClick={() => setEditing(null)}>
              + Add picture
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty">No pictures yet.{editable ? ' Add the first one with “+ Add picture”.' : ''}</div>
      ) : (
        groups.map((group) => (
          <div key={group.title} className="award-group">
            <h3 className="section-title">{group.title}</h3>
            <ul className="picture-grid">
              {group.items.map(({ entry, index }) => (
                <li key={entry.id}>
                  <button className="picture-card" onClick={() => setViewing(index)}>
                    <img src={imageUrl(entry.image)} alt={entry.description || 'Gallery picture'} loading="lazy" />
                    <span className="picture-card-text">
                      <span className="muted small">{entry.date ? formatDate(entry.date) : 'No date'}</span>
                      {entry.description && <span className="picture-card-description">{entry.description}</span>}
                      {entry.games.length > 0 && (
                        <span className="picture-card-games small muted">{entry.games.map((g) => g.title).join(' · ')}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {viewing !== null && entries[viewing] && editing === undefined && (
        <Viewer
          entries={entries}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          link={link}
          onOpen={onOpen}
          onEdit={editable ? setEditing : undefined}
        />
      )}
      {editing !== undefined && (
        <GalleryEditor entry={editing} games={games} link={link} onSaved={onSaved} onDeleted={onDeleted} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}
