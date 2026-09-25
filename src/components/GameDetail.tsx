import { useEffect, type ReactNode } from 'react';
import type { Game } from '../types';
import { formatDate, formatNumber, formatPlaytime, genreLabel } from '../lib/format';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge, StatusBadge } from './Badges';

interface Props {
  game: Game;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  actions?: ReactNode;
}

export function GameDetail({ game, onClose, onPrev, onNext, actions }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const rows: [string, ReactNode][] = [
    ['Status', <StatusBadge status={game.status} />],
    ['Acquired', formatDate(game.acquired)],
    ['Completed', formatDate(game.completed)],
    ['Times completed', formatNumber(game.timesCompleted)],
    ['Completion', formatNumber(game.percent, '%')],
    ['Playtime', formatPlaytime(game.playtime)],
    ['Condition', game.condition.join(', ') || '—'],
    ['Edition', game.edition || '—'],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail" role="dialog" aria-modal="true" aria-label={game.title} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="detail-cover">
          <Cover game={game} eager />
        </div>
        <div className="detail-info">
          <div className="detail-top">
            <PlatformBadge platform={game.platform} />
            <span className="muted">#{game.id}</span>
          </div>
          <h2 className="detail-title">{game.title}</h2>
          <div className="detail-rating">
            <RatingBadge rating={game.rating} />
            <div className="chips">
              {game.genres.map((g) => (
                <span key={g} className="chip static">
                  {genreLabel(g)}
                </span>
              ))}
            </div>
          </div>
          <dl className="detail-list">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {game.note && (
            <div className="detail-note">
              <dt>Notes</dt>
              <dd>{game.note}</dd>
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
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
