import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlogPost, ChecklistCollection, Game, GalleryEntry, GotcData, GameConsole, GotmMonth, Query, SortKey, Vinyl } from './types';
import { DEFAULT_QUERY, SORT_LABELS, applyQuery, paramsToQuery, queryToParams } from './lib/query';
import { Filters } from './components/Filters';
import { SortBuilder } from './components/SortBuilder';
import { GridView } from './components/GridView';
import { TableView } from './components/TableView';
import { GameDetail } from './components/GameDetail';
import { GameForm } from './components/GameForm';
import { ImageManager, type ImageOps } from './components/ImageManager';
import { GotmView } from './components/GotmView';
import { GotcView } from './components/GotcView';
import { GalleryView } from './components/GalleryView';
import { ChecklistView } from './components/ChecklistView';
import { VinylView } from './components/VinylView';
import { ConsolesView } from './components/ConsolesView';
import { BlogView } from './components/BlogView';
import { WhatsNew } from './components/WhatsNew';
// The map carries the world's country shapes, so it's only loaded when opened.
const MapView = lazy(() => import('./components/MapView'));
import { api, detectEditing } from './lib/api';
import { createLinker } from './lib/links';
import { findChanges, loadSnapshot, saveSnapshot, type ChangeGroup, type ChangeTab } from './lib/whatsNew';

type GameTab = 'collection' | 'gotm' | 'gotc' | 'gallery' | 'map' | 'consoles' | 'blog';
/** Collections that aren't games. Each one is public/data/<id>.json. */
const OTHER_COLLECTIONS = [
  { id: 'dylan-dog', label: 'Dylan Dog', short: 'Dylan Dog' },
  { id: 'vinyl', label: 'Vinyl', short: 'Vinyl' },
] as const;
type OtherTab = (typeof OTHER_COLLECTIONS)[number]['id'];
type Tab = GameTab | OtherTab;
const isOther = (t: Tab): t is OtherTab => OTHER_COLLECTIONS.some((c) => c.id === t);
const TABS: { id: GameTab; label: string; short: string }[] = [
  { id: 'collection', label: 'Collection', short: 'Collection' },
  { id: 'gotm', label: 'Game of the Month', short: 'GOTM' },
  { id: 'gotc', label: 'Awards', short: 'Awards' },
  { id: 'gallery', label: 'Gallery', short: 'Gallery' },
  { id: 'map', label: 'Map', short: 'Map' },
  { id: 'consoles', label: 'Consoles', short: 'Consoles' },
  { id: 'blog', label: 'Blog', short: 'Blog' },
];
const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(location.search).get('tab');
  return TABS.some((x) => x.id === t) || OTHER_COLLECTIONS.some((c) => c.id === t) ? (t as Tab) : 'collection';
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

const GAME_IMAGE_OPS: ImageOps<Game> = { add: api.addImage, remove: api.removeImage, setCover: api.setCover };

type Modal = { kind: 'detail' | 'edit' | 'images'; id: number } | { kind: 'new' } | null;

export default function App() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>(() => paramsToQuery(location.search));
  const [modal, setModal] = useState<Modal>(null);
  const [editable, setEditable] = useState(false);
  const [editingChecked, setEditingChecked] = useState(false);
  const [whatsNew, setWhatsNew] = useState<ChangeGroup[] | null>(null);
  // An item picked in the What's new pop-up, for its tab to open or scroll to.
  const [focus, setFocus] = useState<{ tab: Tab; id: number | string } | null>(null);
  const clearFocus = useCallback(() => setFocus(null), []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  // On the published site everything is loaded, to tell visitors what changed since their last visit.
  const checkChanges = editingChecked && !editable;
  // Always loaded: a game's Last played comes from Game of the Month, and the year editor fills stats from it.
  const gotm = useDataFile<GotmMonth[]>('gotm.json', true);
  const gotc = useDataFile<GotcData>('gotc.json', tab === 'gotc' || checkChanges);
  const gallery = useDataFile<GalleryEntry[]>('gallery.json', tab === 'gallery' || checkChanges);
  const dylanDog = useDataFile<ChecklistCollection>('dylan-dog.json', tab === 'dylan-dog' || checkChanges);
  const vinyl = useDataFile<Vinyl[]>('vinyl.json', tab === 'vinyl' || checkChanges);
  const consoles = useDataFile<GameConsole[]>('consoles.json', tab === 'consoles' || checkChanges);
  const blog = useDataFile<BlogPost[]>('blog.json', tab === 'blog' || checkChanges);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/games.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setGames)
      .catch((e) => setError(String(e)));
    detectEditing().then((on) => (setEditable(on), setEditingChecked(true)));
  }, []);

  // Compares the collection with the visitor's last visit. A first visit only saves it.
  const changesChecked = useRef(false);
  useEffect(() => {
    if (!checkChanges || changesChecked.current) return;
    if (!games || !gotm.data || !gotc.data || !gallery.data || !dylanDog.data || !vinyl.data || !consoles.data || !blog.data) return;
    changesChecked.current = true;
    const now = {
      games,
      gotm: gotm.data,
      gotc: gotc.data,
      gallery: gallery.data,
      dylanDog: dylanDog.data,
      vinyl: vinyl.data,
      consoles: consoles.data,
      blog: blog.data.filter((p) => !p.draft),
    };
    const before = loadSnapshot();
    saveSnapshot(now);
    if (!before) return;
    const groups = findChanges(before, now);
    if (groups.length) setWhatsNew(groups);
  }, [checkChanges, games, gotm.data, gotc.data, gallery.data, dylanDog.data, vinyl.data, consoles.data, blog.data]);

  // Switching tabs adds a history entry, so Back and Forward move between tabs.
  // Filter, sort and search changes only update the current entry.
  const pushNext = useRef(false);
  const goTo = (next: Tab) => {
    if (next !== tab) pushNext.current = true;
    setTab(next);
    scrollTo(0, 0);
  };

  useEffect(() => {
    const params = tab === 'collection' ? queryToParams(query) : `tab=${tab}`;
    const push = pushNext.current;
    pushNext.current = false;
    if (location.search === (params ? `?${params}` : '')) return;
    history[push ? 'pushState' : 'replaceState'](null, '', params ? `?${params}` : location.pathname);
  }, [query, tab]);

  // Back and Forward: show the tab (and, for the collection, the filters) the URL describes.
  useEffect(() => {
    const onPop = () => {
      const next = tabFromUrl();
      setTab(next);
      if (next === 'collection') setQuery(paramsToQuery(location.search));
      setModal(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const link = useMemo(() => createLinker(games ?? []), [games]);

  /** Each game's latest Game of the Month entry (yyyy-mm), by game id. */
  const lastPlayed = useMemo(() => {
    const out = new Map<number, string>();
    for (const m of gotm.data ?? []) {
      for (const ref of [m.gameOfTheMonth, ...m.played]) {
        const game = link(ref);
        if (game && m.month > (out.get(game.id) ?? '')) out.set(game.id, m.month);
      }
    }
    return out;
  }, [gotm.data, link]);

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

  /** The header's stats line for the open other collection, as [number, label] pairs. */
  const otherStats = useMemo((): [number, string][] | null => {
    if (tab === 'dylan-dog' && dylanDog.data) {
      const { series } = dylanDog.data;
      const items = series.flatMap((s) => s.items);
      const owned = items.filter((i) => i.owned).length;
      const complete = series.filter((s) => s.items.length && s.items.every((i) => i.owned)).length;
      return [[owned, 'owned'], [items.length - owned, 'missing'], [series.length, 'series'], [complete, 'complete']];
    }
    if (tab === 'vinyl' && vinyl.data) {
      const records = vinyl.data;
      return [[records.length, 'records'], [new Set(records.map((r) => r.artist)).size, 'artists'], [records.reduce((n, r) => n + r.listens.length, 0), 'sides played']];
    }
    return null;
  }, [tab, dylanDog.data, vinyl.data]);

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

  /** Opens the collection showing only one platform's games. */
  const showPlatform = (platform: string) => {
    setQuery({ ...DEFAULT_QUERY, view: query.view, platforms: [platform] });
    goTo('collection');
  };

  const openId = modal && modal.kind !== 'new' ? modal.id : null;
  const openIndex = openId === null ? -1 : results.findIndex((g) => g.id === openId);
  const openGame = openId === null ? null : (games?.find((g) => g.id === openId) ?? null);
  const showDetail = (id: number) => setModal({ kind: 'detail', id });
  const openChange = (tab: ChangeTab, id: number | string) => {
    if (tab === 'collection') return showDetail(id as number);
    goTo(tab);
    setFocus({ tab, id });
  };
  const focusOn = <T,>(t: Tab) => (focus?.tab === t ? (focus.id as T) : undefined);
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
    <div className="app" data-collection={isOther(tab) ? tab : undefined}>
      <header className="header">
        {isOther(tab) ? (
          <div className="brand">
            <h1>{OTHER_COLLECTIONS.find((c) => c.id === tab)!.label}</h1>
            <p className="stats">
              {otherStats ? (
                otherStats.map(([n, label]) => (
                  <span key={label}>
                    <b>{n}</b> {label}
                  </span>
                ))
              ) : (
                <span>&nbsp;</span>
              )}
            </p>
          </div>
        ) : (
          <div className="brand">
            <h1>Game Collection</h1>
            <p className="stats">
              <span><b>{stats.total}</b> games</span>
              <span><b>{stats.completed}</b> completed</span>
              <span><b>{stats.platforms}</b> platforms</span>
              <span><b>{stats.avg.toFixed(1)}</b> avg rating</span>
            </p>
          </div>
        )}
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
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined} onClick={() => goTo(t.id)}>
            <span className="tab-long">{t.label}</span>
            <span className="tab-short">{t.short}</span>
          </button>
        ))}
        <span className="tabs-divider" aria-hidden="true" />
        <span className="tabs-group-label">Other</span>
        {OTHER_COLLECTIONS.map((c) => (
          <button key={c.id} className={`other-tab tab-${c.id} ${tab === c.id ? 'on' : ''}`} aria-label={c.label} aria-current={tab === c.id ? 'page' : undefined} onClick={() => goTo(c.id)}>
            <span className="tab-long">{c.label}</span>
            <span className="tab-short">{c.short}</span>
          </button>
        ))}
      </nav>

      {tab === 'dylan-dog' &&
        (dylanDog.data ? (
          <ChecklistView slug={tab} data={dylanDog.data} editable={editable} onChange={dylanDog.setData} focus={focusOn<number>('dylan-dog')} onFocused={clearFocus} />
        ) : (
          <div className="empty">{dylanDog.error ? `Couldn't load the collection: ${dylanDog.error}` : 'Loading…'}</div>
        ))}
      {tab === 'vinyl' &&
        (vinyl.data ? (
          <VinylView records={vinyl.data} editable={editable} onChange={vinyl.setData} focus={focusOn<number>('vinyl')} onFocused={clearFocus} />
        ) : (
          <div className="empty">{vinyl.error ? `Couldn't load the records: ${vinyl.error}` : 'Loading…'}</div>
        ))}

      {tab === 'gotm' &&
        (gotm.data ? (
          <GotmView months={gotm.data} link={link} onOpen={(g) => showDetail(g.id)} editable={editable} games={games} onChange={gotm.setData} focus={focusOn<string>('gotm')} onFocused={clearFocus} />
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
            focus={focusOn<number>('gotc')}
            onFocused={clearFocus}
          />
        ) : (
          <div className="empty">{gotc.error ? `Couldn't load the awards: ${gotc.error}` : 'Loading…'}</div>
        ))}
      {tab === 'gallery' &&
        (gallery.data ? (
          <GalleryView entries={gallery.data} link={link} onOpen={(g) => showDetail(g.id)} editable={editable} games={games} onChange={gallery.setData} focus={focusOn<number>('gallery')} onFocused={clearFocus} />
        ) : (
          <div className="empty">{gallery.error ? `Couldn't load the gallery: ${gallery.error}` : 'Loading…'}</div>
        ))}

      {tab === 'consoles' &&
        (consoles.data ? (
          <ConsolesView consoles={consoles.data} games={games} editable={editable} onChange={consoles.setData} onShowGames={showPlatform} focus={focusOn<number>('consoles')} onFocused={clearFocus} />
        ) : (
          <div className="empty">{consoles.error ? `Couldn't load the consoles: ${consoles.error}` : 'Loading…'}</div>
        ))}
      {tab === 'blog' &&
        (blog.data ? (
          <BlogView posts={blog.data} editable={editable} onChange={blog.setData} focus={focusOn<number>('blog')} onFocused={clearFocus} />
        ) : (
          <div className="empty">{blog.error ? `Couldn't load the blog: ${blog.error}` : 'Loading…'}</div>
        ))}

      {tab === 'map' && (
        <Suspense fallback={<div className="empty">Loading map…</div>}>
          <MapView games={games} onOpen={(g) => showDetail(g.id)} />
        </Suspense>
      )}

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

      {whatsNew && <WhatsNew groups={whatsNew} onClose={() => setWhatsNew(null)} onOpenItem={openChange} />}
      {modal?.kind === 'detail' && openGame && (
        <GameDetail
          game={openGame}
          lastPlayed={lastPlayed.get(openGame.id)}
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
      {modal?.kind === 'images' && openGame && (
        <ImageManager
          item={openGame}
          title={openGame.title}
          ops={GAME_IMAGE_OPS}
          findLinks={
            <>
              <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${openGame.title} ${openGame.platform} cover`)}`} target="_blank" rel="noreferrer">
                Google Images
              </a>{' '}
              ·{' '}
              <a href={`https://www.mobygames.com/search/?q=${encodeURIComponent(openGame.title)}`} target="_blank" rel="noreferrer">
                MobyGames
              </a>
            </>
          }
          onClose={backToDetail}
          onSaved={upsert}
        />
      )}
    </div>
  );
}
