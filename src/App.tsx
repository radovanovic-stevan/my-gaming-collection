import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, GotcData, GotmMonth, Query, SortKey } from './types';
import { DEFAULT_QUERY, SORT_LABELS, applyQuery, paramsToQuery, queryToParams } from './lib/query';
import { Filters } from './components/Filters';
import { SortBuilder } from './components/SortBuilder';
import { GridView } from './components/GridView';
import { TableView } from './components/TableView';
import { GameDetail } from './components/GameDetail';
import { GameForm } from './components/GameForm';
import { ImageManager } from './components/ImageManager';
import { GotmView } from './components/GotmView';
import { GotcView } from './components/GotcView';
import { api, detectEditing } from './lib/api';
import { createLinker } from './lib/links';

type Tab = 'collection' | 'gotm' | 'gotc';
const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'collection', label: 'Collection', short: 'Collection' },
  { id: 'gotm', label: 'Game of the Month', short: 'GOTM' },
  { id: 'gotc', label: 'Game of the Category', short: 'GOTC' },
];
const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(location.search).get('tab');
  return t === 'gotm' || t === 'gotc' ? t : 'collection';
};

/** Fetches a JSON file from public/data the first time it's needed. */
function useDataFile<T>(file: string, needed: boolean): { data: T | null; error: string | null; setData: (data: T) => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!needed || started) return;
    setStarted(true);
    fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setState({ data, error: null }))
      .catch((e) => setState({ data: null, error: String(e) }));
  }, [file, needed, started]);
  const setData = useCallback((data: T) => setState({ data, error: null }), []);
  return { ...state, setData };
}

type Modal = { kind: 'detail' | 'edit' | 'images'; id: number } | { kind: 'new' } | null;

export default function App() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>(() => paramsToQuery(location.search));
  const [modal, setModal] = useState<Modal>(null);
  const [editable, setEditable] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  // The year editor fills stats from Game of the Month, so load it for editing too.
  const gotm = useDataFile<GotmMonth[]>('gotm.json', tab === 'gotm' || (tab === 'gotc' && editable));
  const gotc = useDataFile<GotcData>('gotc.json', tab === 'gotc');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/games.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setGames)
      .catch((e) => setError(String(e)));
    detectEditing().then(setEditable);
  }, []);

  useEffect(() => {
    const params = tab === 'collection' ? queryToParams(query) : `tab=${tab}`;
    history.replaceState(null, '', params ? `?${params}` : location.pathname);
  }, [query, tab]);

  const link = useMemo(() => createLinker(games ?? []), [games]);

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

  const openId = modal && modal.kind !== 'new' ? modal.id : null;
  const openIndex = openId === null ? -1 : results.findIndex((g) => g.id === openId);
  const openGame = openId === null ? null : (games?.find((g) => g.id === openId) ?? null);
  const showDetail = (id: number) => setModal({ kind: 'detail', id });
  const closeModal = useCallback(() => setModal(null), []);
  const backToDetail = useCallback(() => setModal((m) => (m && m.kind !== 'new' ? { kind: 'detail', id: m.id } : null)), []);

  const upsert = (saved: Game) =>
    setGames((gs) => (gs!.some((g) => g.id === saved.id) ? gs!.map((g) => (g.id === saved.id ? saved : g)) : [...gs!, saved]));

  const deleteGame = async (game: Game) => {
    if (!confirm(`Delete "${game.title}" (#${game.id}) from the collection? This can't be undone.`)) return;
    try {
      await api.remove(game.id);
      setGames((gs) => gs!.filter((g) => g.id !== game.id));
      setModal(null);
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const activeFilterCount =
    query.platforms.length + query.statuses.length + query.genres.length + query.conditions.length + query.acquiredYears.length + query.completedYears.length +
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
        {editable && tab === 'collection' && (
          <div className="header-actions">
            <span className="edit-pill" title="Changes are written to public/data and public/images">Local editing on</span>
            <button className="btn primary" onClick={() => setModal({ kind: 'new' })}>
              + Add game
            </button>
          </div>
        )}
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined} onClick={() => (setTab(t.id), scrollTo(0, 0))}>
            <span className="tab-long">{t.label}</span>
            <span className="tab-short">{t.short}</span>
          </button>
        ))}
      </nav>

      {tab === 'gotm' &&
        (gotm.data ? (
          <GotmView months={gotm.data} link={link} onOpen={(g) => showDetail(g.id)} editable={editable} games={games} onChange={gotm.setData} />
        ) : (
          <div className="empty">{gotm.error ? `Couldn't load Game of the Month: ${gotm.error}` : 'Loading…'}</div>
        ))}
      {tab === 'gotc' &&
        (gotc.data ? (
          <GotcView
            data={gotc.data}
            link={link}
            onOpen={(g) => showDetail(g.id)}
            editable={editable}
            games={games}
            months={gotm.data}
            onChange={gotc.setData}
          />
        ) : (
          <div className="empty">{gotc.error ? `Couldn't load Game of the Category: ${gotc.error}` : 'Loading…'}</div>
        ))}

      {tab === 'collection' && (
        <>
          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder="Search titles, platforms, editions…"
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
            <Filters
              games={games}
              query={query}
              onChange={patch}
              onReset={() => setQuery({ ...DEFAULT_QUERY, view: query.view })}
              resultCount={results.length}
              onDone={() => setFiltersOpen(false)}
            />
            <main className="results">
              <p className="result-count">
                Showing <b>{results.length}</b> of {games.length}
              </p>
              {results.length === 0 ? (
                <div className="empty">No games match these filters.</div>
              ) : query.view === 'grid' ? (
                <GridView games={results} onOpen={(g) => showDetail(g.id)} />
              ) : (
                <TableView games={results} sort={query.sort} onSortClick={onSortClick} onOpen={(g) => showDetail(g.id)} />
              )}
            </main>
          </div>
        </>
      )}

      {modal?.kind === 'detail' && openGame && (
        <GameDetail
          game={openGame}
          onClose={closeModal}
          onPrev={tab === 'collection' && openIndex > 0 ? () => showDetail(results[openIndex - 1].id) : undefined}
          onNext={tab === 'collection' && openIndex >= 0 && openIndex < results.length - 1 ? () => showDetail(results[openIndex + 1].id) : undefined}
          actions={
            editable && (
              <div className="detail-nav">
                <button className="btn" onClick={() => setModal({ kind: 'images', id: openGame.id })}>
                  Images{openGame.images.length ? ` (${openGame.images.length})` : ''}
                </button>
                <button className="btn" onClick={() => setModal({ kind: 'edit', id: openGame.id })}>
                  Edit
                </button>
                <button className="btn danger" onClick={() => deleteGame(openGame)}>
                  Delete
                </button>
              </div>
            )
          }
        />
      )}
      {modal?.kind === 'edit' && openGame && (
        <GameForm game={openGame} allGames={games} onClose={backToDetail} onSaved={(g) => (upsert(g), showDetail(g.id))} />
      )}
      {modal?.kind === 'new' && (
        <GameForm game={null} allGames={games} onClose={closeModal} onSaved={(g) => (upsert(g), setModal({ kind: 'images', id: g.id }))} />
      )}
      {modal?.kind === 'images' && openGame && <ImageManager game={openGame} onClose={backToDetail} onSaved={upsert} />}
    </div>
  );
}
