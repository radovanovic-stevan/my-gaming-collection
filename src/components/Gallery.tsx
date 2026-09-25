import { useEffect, useState } from 'react';
import type { Game } from '../types';
import { imageUrl } from '../lib/format';
import { Cover } from './Cover';

/** Cover first, then the rest in the order they were added. */
const orderedImages = (g: Game) => (g.cover ? [g.cover, ...g.images.filter((f) => f !== g.cover)] : g.images);

export function Gallery({ game }: { game: Game }) {
  const images = orderedImages(game);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // Start from the cover whenever a different game (or a changed image set) is shown.
  const key = `${game.id}:${images.join(',')}`;
  useEffect(() => {
    setIndex(0);
    setZoomed(false);
  }, [key]);

  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  useEffect(() => {
    if (!zoomed) return;
    // Capture phase so the arrows page through images instead of games while zoomed.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (images.length === 0) {
    return (
      <div className="gallery">
        <div className="gallery-main">
          <Cover game={game} eager />
        </div>
      </div>
    );
  }

  const current = images[Math.min(index, images.length - 1)];

  return (
    <div className="gallery">
      <button className="gallery-main" onClick={() => setZoomed(true)} title="View full size">
        <img className="cover" src={imageUrl(current)} alt={`${game.title} image ${index + 1}`} />
        {images.length > 1 && (
          <span className="gallery-count">
            {index + 1} / {images.length}
          </span>
        )}
      </button>

      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((file, i) => (
            <button key={file} className={i === index ? 'on' : ''} onClick={() => setIndex(i)} aria-label={`Image ${i + 1}`}>
              <img src={imageUrl(file)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(false)}>
          <img src={imageUrl(current)} alt={`${game.title} image ${index + 1}`} onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && (
            <>
              <button className="lightbox-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))} aria-label="Previous image">
                ‹
              </button>
              <button className="lightbox-nav next" onClick={(e) => (e.stopPropagation(), step(1))} aria-label="Next image">
                ›
              </button>
            </>
          )}
          <button className="lightbox-close icon-btn" onClick={() => setZoomed(false)} aria-label="Close">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
