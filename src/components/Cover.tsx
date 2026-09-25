import { useState } from 'react';
import type { Game } from '../types';
import { coverUrl, platformHue } from '../lib/format';

export function Cover({ game, eager = false }: { game: Game; eager?: boolean }) {
  const url = coverUrl(game);
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        className="cover"
        src={url}
        alt={`${game.title} cover`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="cover cover-placeholder" style={{ '--hue': platformHue(game.platform) } as React.CSSProperties}>
      <span className="cover-placeholder-platform">{game.platform}</span>
      <span className="cover-placeholder-title">{game.title}</span>
    </div>
  );
}
