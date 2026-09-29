import { useEffect } from 'react';
import type { GameConsole } from '../types';
import { formatDate } from '../lib/format';
import { Gallery } from './Gallery';
import { ConsoleCover } from './ConsolesView';
import { Paragraphs } from './BlogView';

interface Props {
  item: GameConsole;
  /** Games in the collection for this console's platform. */
  gameCount: number;
  /** Local editing (dev server only). */
  editable: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onShowGames: (platform: string) => void;
  onEdit: () => void;
  onImages: () => void;
  onDelete: () => void;
}

export function ConsoleDetail({ item, gameCount, editable, onClose, onPrev, onNext, onShowGames, onEdit, onImages, onDelete }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail vinyl-detail console-detail" role="dialog" aria-modal="true" aria-label={item.name} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="detail-cover">
          <Gallery item={{ ...item, title: item.name }} placeholder={<ConsoleCover item={item} />} />
        </div>
        <div className="detail-info">
          {item.maker && <span className="eyebrow">{item.maker}</span>}
          <h2 className="detail-title">{item.name}</h2>
          <dl className="detail-list">
            <div>
              <dt>Acquired</dt>
              <dd>{formatDate(item.acquired)}</dd>
            </div>
            {item.platform && (
              <div>
                <dt>Games</dt>
                <dd>
                  {gameCount}
                  {gameCount > 0 && (
                    <>
                      {' '}
                      <button className="link" onClick={() => onShowGames(item.platform!)}>
                        Show them →
                      </button>
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {item.models.length > 0 && (
            <div className="console-models">
              <h3 className="section-title">{item.models.length === 1 ? 'Model' : 'Models'}</h3>
              <ul>
                {item.models.map((m, i) => (
                  <li key={i}>
                    <div className="console-model-picture">
                      <ConsoleCover item={item} image={m.image} />
                    </div>
                    <span>{m.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.notes && (
            <div className="console-notes">
              <Paragraphs text={item.notes} />
            </div>
          )}

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
                  Images{item.images.length ? ` (${item.images.length})` : ''}
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
