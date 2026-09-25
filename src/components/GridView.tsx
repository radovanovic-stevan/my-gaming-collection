import type { Game } from '../types';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge } from './Badges';

interface Props {
  games: Game[];
  onOpen: (game: Game) => void;
}

export function GridView({ games, onOpen }: Props) {
  return (
    <ul className="grid">
      {games.map((g) => (
        <li key={g.id}>
          <button className="card" onClick={() => onOpen(g)} title={g.title}>
            <div className="card-cover">
              <Cover game={g} />
              <RatingBadge rating={g.rating} />
              {g.genres.includes('<3') && <span className="card-heart" aria-label="Favourite">♥</span>}
            </div>
            <div className="card-body">
              <span className="card-title">{g.title}</span>
              <span className="card-meta">
                <PlatformBadge platform={g.platform} />
                <span className={`dot dot-${g.status.toLowerCase().replace(/\s+/g, '-')}`} title={g.status} />
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
