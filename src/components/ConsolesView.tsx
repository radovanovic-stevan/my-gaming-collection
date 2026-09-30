import { useMemo, useState } from 'react';
import type { Game, GameConsole } from '../types';
import { api } from '../lib/api';
import { useFocus } from '../lib/focus';
import { imageUrl, platformHue } from '../lib/format';
import { ImageManager, type ImageOps } from './ImageManager';
import { ConsoleDetail } from './ConsoleDetail';
import { ConsoleForm } from './ConsoleForm';

interface Props {
  consoles: GameConsole[];
  /** The game collection, for each console's game count. */
  games: Game[];
  /** Local editing (dev server only). */
  editable: boolean;
  onChange: (consoles: GameConsole[]) => void;
  /** Opens the collection filtered to one platform. */
  onShowGames: (platform: string) => void;
  /** An item picked in the What's new pop-up, to show once. */
  focus?: number;
  onFocused?: () => void;
}

type SortKey = 'maker' | 'name' | 'games' | 'added';
const SORTS: Record<SortKey, string> = { maker: 'Maker', name: 'Name', games: 'Most games', added: 'Recently added' };

type Modal = { kind: 'detail' | 'edit' | 'images'; id: number } | { kind: 'new' } | null;

const CONSOLE_IMAGE_OPS: ImageOps<GameConsole> = { add: api.addConsoleImage, remove: api.removeConsoleImage, setCover: api.setConsoleCover };

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** A picture of a console (its cover by default), or a placeholder with its name. */
export function ConsoleCover({ item, image = item.cover }: { item: GameConsole; image?: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (image && failed !== image) {
    return <img className="cover" src={imageUrl(image)} alt={item.name} loading="lazy" decoding="async" onError={() => setFailed(image)} />;
  }
  return (
    <div className="cover cover-placeholder" style={{ '--hue': platformHue(item.maker || item.name) } as React.CSSProperties}>
      <span className="cover-placeholder-platform">{item.maker}</span>
      <span className="cover-placeholder-title">{item.name}</span>
    </div>
  );
}

export function ConsolesView({ consoles, games, editable, onChange, onShowGames, focus, onFocused }: Props) {
  const [search, setSearch] = useState('');
  // Consoles are added roughly in order, so by maker and then id keeps each maker's line-up in release order.
  const [sort, setSort] = useState<SortKey>('maker');
  const [modal, setModal] = useState<Modal>(null);

  const gameCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1);
    return (item: GameConsole) => (item.platform ? (counts.get(item.platform) ?? 0) : 0);
  }, [games]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = consoles.filter(
      (r) => !q || `${r.name} ${r.maker} ${r.platform ?? ''} ${r.notes} ${r.models.map((m) => m.name).join(' ')}`.toLowerCase().includes(q),
    );
    const compare: Record<SortKey, (a: GameConsole, b: GameConsole) => number> = {
      maker: (a, b) => byText(a.maker, b.maker) || a.id - b.id,
      name: (a, b) => byText(a.name, b.name),
      games: (a, b) => gameCount(b) - gameCount(a) || byText(a.name, b.name),
      added: (a, b) => b.id - a.id,
    };
    return [...matching].sort(compare[sort]);
  }, [consoles, search, sort, gameCount]);

  /** Sorted by maker, the grid is split into one group per maker, biggest line-up first. */
  const groups = useMemo(() => {
    if (sort !== 'maker') return [{ title: null, items: shown }];
    const out: { title: string | null; items: GameConsole[] }[] = [];
    for (const item of shown) {
      const title = item.maker || 'Other';
      if (out.at(-1)?.title !== title) out.push({ title, items: [] });
      out.at(-1)!.items.push(item);
    }
    return out.sort((a, b) => b.items.length - a.items.length);
  }, [shown, sort]);

  const upsert = (saved: GameConsole) =>
    onChange(consoles.some((r) => r.id === saved.id) ? consoles.map((r) => (r.id === saved.id ? saved : r)) : [...consoles, saved]);

  const remove = async (item: GameConsole) => {
    if (!confirm(`Delete "${item.name}" and its pictures? This can't be undone.`)) return;
    try {
      await api.deleteConsole(item.id);
      onChange(consoles.filter((r) => r.id !== item.id));
      setModal(null);
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const openId = modal && modal.kind !== 'new' ? modal.id : null;
  const open = openId === null ? null : (consoles.find((r) => r.id === openId) ?? null);
  const openIndex = open ? shown.findIndex((r) => r.id === open.id) : -1;
  const showDetail = (id: number) => setModal({ kind: 'detail', id });
  const backToDetail = () => setModal((m) => (m && m.kind !== 'new' ? { kind: 'detail', id: m.id } : null));
  useFocus(focus, onFocused, showDetail);

  return (
    <section className="awards consoles">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search consoles…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="vinyl-sort">
          <span className="muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k]}
              </option>
            ))}
          </select>
        </label>
        {editable && (
          <button className="btn primary" onClick={() => setModal({ kind: 'new' })}>
            + Add console
          </button>
        )}
      </div>

      <p className="result-count">
        Showing <b>{shown.length}</b> of {consoles.length}
      </p>
      {shown.length === 0 ? (
        <div className="empty">{consoles.length ? 'No consoles match.' : `No consoles yet.${editable ? ' Add the first one with “+ Add console”.' : ''}`}</div>
      ) : (
        groups.map((group) => (
          <div key={group.title ?? 'all'} className="console-group">
            {group.title && <h3 className="section-title">{group.title}</h3>}
            <ul className="grid console-grid">
              {group.items.map((r) => {
                const count = gameCount(r);
                return (
                  <li key={r.id}>
                    <button className="card" onClick={() => showDetail(r.id)} title={r.name}>
                      <div className="card-cover">
                        <ConsoleCover item={r} />
                        {r.models.length > 1 && (
                          <span className="card-count" title={`${r.models.length} models`}>
                            {r.models.length} models
                          </span>
                        )}
                        {count > 0 && (
                          <span className="plays-badge" title={`${count} ${count === 1 ? 'game' : 'games'} in the collection`}>
                            {count} {count === 1 ? 'game' : 'games'}
                          </span>
                        )}
                      </div>
                      <div className="card-body">
                        <span className="card-title">{r.name}</span>
                        <span className="muted small">{r.models.length ? r.models.map((m) => m.name).join(' · ') : r.maker}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      {modal?.kind === 'detail' && open && (
        <ConsoleDetail
          item={open}
          gameCount={gameCount(open)}
          editable={editable}
          onClose={() => setModal(null)}
          onPrev={openIndex > 0 ? () => showDetail(shown[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < shown.length - 1 ? () => showDetail(shown[openIndex + 1].id) : undefined}
          onShowGames={onShowGames}
          onEdit={() => setModal({ kind: 'edit', id: open.id })}
          onImages={() => setModal({ kind: 'images', id: open.id })}
          onDelete={() => remove(open)}
        />
      )}
      {modal?.kind === 'edit' && open && (
        <ConsoleForm item={open} consoles={consoles} games={games} onClose={backToDetail} onSaved={(r) => (upsert(r), showDetail(r.id))} />
      )}
      {modal?.kind === 'new' && (
        <ConsoleForm item={null} consoles={consoles} games={games} onClose={() => setModal(null)} onSaved={(r) => (upsert(r), setModal({ kind: 'images', id: r.id }))} />
      )}
      {modal?.kind === 'images' && open && (
        <ImageManager
          item={open}
          title={open.name}
          ops={CONSOLE_IMAGE_OPS}
          findLinks={
            <>
              <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${open.maker} ${open.name}`)}`} target="_blank" rel="noreferrer">
                Google Images
              </a>{' '}
              ·{' '}
              <a href={`https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(open.name)}&title=Special:MediaSearch&type=image`} target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
            </>
          }
          onClose={backToDetail}
          onSaved={upsert}
        />
      )}
    </section>
  );
}
