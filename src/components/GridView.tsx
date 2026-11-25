import type { Game } from '../types';
import { matchedIncludes } from '../lib/query';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge } from './Badges';

interface Props {
  games: Game[];
  search: string;
  onOpen: (game: Game) => void;
}

export function GridView({ games, search, onOpen }: Props) {
  return (
    <ul className="grid">
      {games.map((g) => {
        const found = matchedIncludes(g, search);
        return (
          <li key={g.id}>
            <button className="card" onClick={() => onOpen(g)} title={g.title}>
              <div className="card-cover">
                <Cover game={g} />
                <RatingBadge rating={g.rating} />
                {g.images.length > 1 && <span className="card-count" title={`${g.images.length} images`}>{g.images.length}</span>}
                <span className="card-badges">
                  {g.genres.includes('<3') && <span className="card-heart" aria-label="From my wife" title="From my wife">♥</span>}
                  {g.playsVia && <span className="card-plays-via" aria-label={`Plays via ${g.playsVia}`} title={`Plays via ${g.playsVia}`}>⇄</span>}
                </span>
              </div>
              <div className="card-body">
                <span className="card-title">{g.title}</span>
                {found.length > 0 && (
                  <span className="card-includes">
                    Includes {found[0]}
                    {found.length > 1 && ` +${found.length - 1}`}
                  </span>
                )}
                <span className="card-meta">
                  <PlatformBadge platform={g.platform} />
                  <span className={`dot dot-${g.status.toLowerCase().replace(/\s+/g, '-')}`} title={g.status} />
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
