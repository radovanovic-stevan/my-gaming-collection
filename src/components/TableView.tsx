import type { Game, SortKey, SortLevel } from '../types';
import { formatDate, formatNumber, formatPlaytime, genreLabel } from '../lib/format';
import { PlatformBadge, RatingBadge, StatusBadge } from './Badges';
import { Cover } from './Cover';

interface Props {
  games: Game[];
  sort: SortLevel[];
  onSortClick: (key: SortKey, additive: boolean) => void;
  onOpen: (game: Game) => void;
}

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'id', label: '#', className: 'num' },
  { key: null, label: '' },
  { key: 'title', label: 'Title' },
  { key: 'platform', label: 'Platform' },
  { key: 'status', label: 'Status' },
  { key: 'rating', label: 'Rating', className: 'num' },
  { key: 'acquired', label: 'Acquired' },
  { key: 'completed', label: 'Completed' },
  { key: 'timesCompleted', label: '×', className: 'num' },
  { key: 'percent', label: '%', className: 'num' },
  { key: 'playtime', label: 'Time', className: 'num' },
  { key: null, label: 'Genres' },
  { key: null, label: 'Condition' },
  { key: null, label: 'Edition' },
];

export function TableView({ games, sort, onSortClick, onOpen }: Props) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((c, i) => {
              const level = c.key ? sort.findIndex((s) => s.key === c.key) : -1;
              return (
                <th key={i} className={c.className} aria-sort={level === 0 ? (sort[0].dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.key ? (
                    <button
                      className={`th-sort ${level >= 0 ? 'active' : ''}`}
                      onClick={(e) => onSortClick(c.key!, e.shiftKey)}
                      title="Click to sort, Shift+click to add as a secondary sort"
                    >
                      {c.label}
                      {level >= 0 && (
                        <span className="th-sort-ind">
                          {sort[level].dir === 'asc' ? '▲' : '▼'}
                          {sort.length > 1 && <sub>{level + 1}</sub>}
                        </span>
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id} onClick={() => onOpen(g)}>
              <td className="num muted">{g.id}</td>
              <td className="td-thumb">
                <Cover game={g} />
              </td>
              <td className="td-title">{g.title}</td>
              <td>
                <PlatformBadge platform={g.platform} />
              </td>
              <td>
                <StatusBadge status={g.status} />
              </td>
              <td className="num">
                <RatingBadge rating={g.rating} />
              </td>
              <td className="nowrap">{formatDate(g.acquired)}</td>
              <td className="nowrap">{formatDate(g.completed)}</td>
              <td className="num">{formatNumber(g.timesCompleted)}</td>
              <td className="num">{formatNumber(g.percent)}</td>
              <td className="num nowrap">{formatPlaytime(g.playtime)}</td>
              <td className="muted">{g.genres.map(genreLabel).join(', ')}</td>
              <td className="muted nowrap">{g.condition.join(', ')}</td>
              <td className="muted">{g.edition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
