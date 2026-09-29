import { useEffect, type ReactNode } from 'react';
import type { Game } from '../types';
import { formatDate, formatMonthYear, formatNumber, formatPlaytime, genreLabel } from '../lib/format';
import { Gallery } from './Gallery';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge, StatusBadge } from './Badges';

interface Props {
  game: Game;
  /** The latest Game of the Month entry (yyyy-mm) that lists this game, if any. */
  lastPlayed?: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  actions?: ReactNode;
}

export function GameDetail({ game, lastPlayed, onClose, onPrev, onNext, actions }: Props) {
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
    ['Last played', lastPlayed ? formatMonthYear(lastPlayed) : '—'],
    ['Times completed', formatNumber(game.timesCompleted)],
    ['Completion', formatNumber(game.percent, '%')],
    ['Playtime', formatPlaytime(game.playtime)],
    ['Condition', game.condition.join(', ') || '—'],
    ['Edition', game.edition || '—'],
    ['Bought in', game.boughtIn || '—'],
  ];
  if (game.trophies)
    rows.push([
      'Trophies',
      <a href={game.trophies} target="_blank" rel="noreferrer">
        View on PSNProfiles ↗
      </a>,
    ]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail" role="dialog" aria-modal="true" aria-label={game.title} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="detail-cover">
          <Gallery item={game} placeholder={<Cover game={game} eager />} />
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
