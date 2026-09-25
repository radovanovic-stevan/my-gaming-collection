import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, Query, SortKey } from './types';
import { DEFAULT_QUERY, SORT_LABELS, applyQuery, paramsToQuery, queryToParams } from './lib/query';
import { Filters } from './components/Filters';
import { SortBuilder } from './components/SortBuilder';
import { GridView } from './components/GridView';
import { TableView } from './components/TableView';
import { GameDetail } from './components/GameDetail';

export default function App() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>(() => paramsToQuery(location.search));
  const [openId, setOpenId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/games.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setGames)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const params = queryToParams(query);
    history.replaceState(null, '', params ? `?${params}` : location.pathname);
  }, [query]);

  const patch = useCallback((p: Partial<Query>) => setQuery((q) => ({ ...q, ...p })), []);

  const results = useMemo(() => (games ? applyQuery(games, query) : []), [games, query]);

  const stats = useMemo(() => {
    if (!games) return null;
    const rated = games.filter((g) => g.rating !== null);
    return {
      total: games.length,
      completed: games.filter((g) => g.status === 'Completed').length,
      platforms: new Set(games.map((g) => g.platform)).size,
      avg: rated.reduce((s, g) => s + g.rating!, 0) / rated.length,
    };
  }, [games]);

  const onSortClick = (key: SortKey, additive: boolean) => {
    setQuery((q) => {
      const existing = q.sort.find((s) => s.key === key);
      if (additive) {
        return existing
          ? { ...q, sort: q.sort.map((s) => (s.key === key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s)) }
          : { ...q, sort: [...q.sort, { key, dir: 'asc' }] };
      }
      const primary = q.sort[0];
      const dir = primary.key === key ? (primary.dir === 'asc' ? 'desc' : 'asc') : key === 'rating' ? 'desc' : 'asc';
      return { ...q, sort: [{ key, dir }, ...q.sort.filter((s) => s.key !== key).slice(0, 1)] };
    });
  };

  const openIndex = openId === null ? -1 : results.findIndex((g) => g.id === openId);
  const openGame = openId === null ? null : (games?.find((g) => g.id === openId) ?? null);

  const activeFilterCount =
    query.platforms.length + query.statuses.length + query.genres.length + query.conditions.length +
    (query.ratingMin !== null ? 1 : 0) + (query.ratingMax !== null ? 1 : 0) + (query.cover !== 'any' ? 1 : 0);

  if (error) return <div className="empty">Couldn't load the collection: {error}</div>;
  if (!games || !stats) return <div className="empty">Loading collection…</div>;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>Game Collection</h1>
          <p className="stats">
            <span><b>{stats.total}</b> games</span>
            <span><b>{stats.completed}</b> completed</span>
            <span><b>{stats.platforms}</b> platforms</span>
            <span><b>{stats.avg.toFixed(1)}</b> avg rating</span>
          </p>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search titles, notes, editions…"
          value={query.search}
          onChange={(e) => patch({ search: e.target.value })}
          autoFocus
        />
        <button className={`btn filters-toggle ${activeFilterCount ? 'on' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        <details className="sort-menu">
          <summary className="btn">
            Sort: {query.sort.map((s) => `${SORT_LABELS[s.key]} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', ')}
          </summary>
          <div className="popover">
            <SortBuilder sort={query.sort} onChange={(sort) => patch({ sort })} />
          </div>
        </details>
        <div className="segmented view-toggle" role="group" aria-label="View">
          <button className={query.view === 'grid' ? 'on' : ''} onClick={() => patch({ view: 'grid' })}>
            Covers
          </button>
          <button className={query.view === 'table' ? 'on' : ''} onClick={() => patch({ view: 'table' })}>
            Table
          </button>
        </div>
      </div>

      <div className={`layout ${filtersOpen ? 'filters-open' : ''}`}>
        <Filters games={games} query={query} onChange={patch} onReset={() => setQuery({ ...DEFAULT_QUERY, view: query.view })} />
        <main className="results">
          <p className="result-count">
            Showing <b>{results.length}</b> of {games.length}
          </p>
          {results.length === 0 ? (
            <div className="empty">No games match these filters.</div>
          ) : query.view === 'grid' ? (
            <GridView games={results} onOpen={(g) => setOpenId(g.id)} />
          ) : (
            <TableView games={results} sort={query.sort} onSortClick={onSortClick} onOpen={(g) => setOpenId(g.id)} />
          )}
        </main>
      </div>

      {openGame && (
        <GameDetail
          game={openGame}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(results[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < results.length - 1 ? () => setOpenId(results[openIndex + 1].id) : undefined}
        />
      )}
    </div>
  );
}
