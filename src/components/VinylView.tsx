import { useMemo, useState } from 'react';
import type { Vinyl, VinylListen } from '../types';
import { api } from '../lib/api';
import { useFocus } from '../lib/focus';
import { acquiredSortKey, formatDate, imageUrl, platformHue } from '../lib/format';
import { ImageManager, type ImageOps } from './ImageManager';
import { VinylDetail } from './VinylDetail';
import { VinylForm } from './VinylForm';

interface Props {
  records: Vinyl[];
  /** Local editing (dev server only). */
  editable: boolean;
  onChange: (records: Vinyl[]) => void;
  /** An item picked in the What's new pop-up, to show once. */
  focus?: number;
  onFocused?: () => void;
}

type SortKey = 'artist' | 'title' | 'plays' | 'sides' | 'recent' | 'recentSides' | 'added';
/** The sorts that list each played side as its own card. */
type SideSortKey = Extract<SortKey, 'sides' | 'recentSides'>;
const isSideSort = (key: SortKey): key is SideSortKey => key === 'sides' || key === 'recentSides';
const SORTS: Record<SortKey, string> = {
  artist: 'Artist',
  title: 'Title',
  plays: 'Most played',
  sides: 'Most played side',
  recent: 'Last played',
  recentSides: 'Last played side',
  added: 'Recently added',
};

/** One card in the grid: a record, or under the side sorts one played side of it. */
type Entry = { record: Vinyl; side?: { name: string; plays: number; /** yyyy-mm-dd, or '' when no listen of it is dated. */ last: string } };

type Modal = { kind: 'detail' | 'edit' | 'images'; id: number } | { kind: 'new' } | null;

const VINYL_IMAGE_OPS: ImageOps<Vinyl> = { add: api.addVinylImage, remove: api.removeVinylImage, setCover: api.setVinylCover };

const lastPlayed = (r: Vinyl) => r.listens.reduce<string>((max, l) => (l.date && l.date > max ? l.date : max), '');
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** How many times each side has been played, in side order (1, 2, …, A, B, …); sides never played are left out. */
export const playsPerSide = (listens: VinylListen[]): [side: string, plays: number][] => {
  const counts = new Map<string, number>();
  for (const l of listens) counts.set(l.side, (counts.get(l.side) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
};

function sortRecords(records: Vinyl[], key: Exclude<SortKey, SideSortKey>): Vinyl[] {
  const artistThenTitle = (a: Vinyl, b: Vinyl) => byText(a.artist, b.artist) || byText(a.title, b.title);
  const compare: Record<typeof key, (a: Vinyl, b: Vinyl) => number> = {
    artist: artistThenTitle,
    title: (a, b) => byText(a.title, b.title) || artistThenTitle(a, b),
    plays: (a, b) => b.listens.length - a.listens.length || artistThenTitle(a, b),
    // Records without a dated listen go last.
    recent: (a, b) => lastPlayed(b).localeCompare(lastPlayed(a)) || artistThenTitle(a, b),
    // Newest acquired first; records without an acquired date go last, newest added first.
    added: (a, b) => acquiredSortKey(b.acquired).localeCompare(acquiredSortKey(a.acquired)) || b.id - a.id,
  };
  return [...records].sort(compare[key]);
}

/**
 * Each played side as its own entry, most played or last played first (sides without a dated listen go last);
 * records that haven't been played are left out.
 */
function sideEntries(records: Vinyl[], key: SideSortKey): Entry[] {
  return sortRecords(records, 'artist')
    .flatMap((record) =>
      playsPerSide(record.listens).map(([name, plays]) => {
        const last = record.listens.reduce<string>((max, l) => (l.side === name && l.date && l.date > max ? l.date : max), '');
        return { record, side: { name, plays, last } };
      }),
    )
    .sort((a, b) => (key === 'sides' ? b.side.plays - a.side.plays : b.side.last.localeCompare(a.side.last)));
}

export function VinylCover({ record }: { record: Vinyl }) {
  const [failed, setFailed] = useState(false);
  if (record.cover && !failed) {
    return <img className="cover" src={imageUrl(record.cover)} alt={`${record.title} cover`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <div className="cover cover-placeholder vinyl-placeholder" style={{ '--hue': platformHue(record.artist) } as React.CSSProperties}>
      <span className="cover-placeholder-platform">{record.artist}</span>
      <span className="cover-placeholder-title">{record.title}</span>
    </div>
  );
}

export function VinylView({ records, editable, onChange, focus, onFocused }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [undatedOnly, setUndatedOnly] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const undatedCount = useMemo(() => records.reduce((n, r) => n + r.listens.filter((l) => !l.date).length, 0), [records]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = records.filter(
      (r) => (!q || `${r.artist} ${r.title}`.toLowerCase().includes(q)) && (!undatedOnly || r.listens.some((l) => !l.date)),
    );
    return isSideSort(sort) ? sideEntries(matching, sort) : sortRecords(matching, sort).map((record): Entry => ({ record }));
  }, [records, search, sort, undatedOnly]);
  // Prev and next step through records, so a record listed once per side is visited once.
  const shownRecords = useMemo(() => [...new Set(shown.map((e) => e.record))], [shown]);

  const upsert = (saved: Vinyl) =>
    onChange(records.some((r) => r.id === saved.id) ? records.map((r) => (r.id === saved.id ? saved : r)) : [...records, saved]);

  const remove = async (record: Vinyl) => {
    if (!confirm(`Delete "${record.artist} – ${record.title}" and its pictures? This can't be undone.`)) return;
    try {
      await api.deleteVinyl(record.id);
      onChange(records.filter((r) => r.id !== record.id));
      setModal(null);
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const openId = modal && modal.kind !== 'new' ? modal.id : null;
  const open = openId === null ? null : (records.find((r) => r.id === openId) ?? null);
  const openIndex = open ? shownRecords.findIndex((r) => r.id === open.id) : -1;
  const showDetail = (id: number) => setModal({ kind: 'detail', id });
  const backToDetail = () => setModal((m) => (m && m.kind !== 'new' ? { kind: 'detail', id: m.id } : null));
  useFocus(focus, onFocused, showDetail);

  return (
    <section className="awards vinyl">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search artists and albums…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        {undatedCount > 0 && (
          <button className={`chip ${undatedOnly ? 'on' : ''}`} aria-pressed={undatedOnly} onClick={() => setUndatedOnly(!undatedOnly)} title="Records with listens that have no date yet">
            Needs dates <span className="chip-count">{undatedCount}</span>
          </button>
        )}
        {editable && (
          <button className="btn primary" onClick={() => setModal({ kind: 'new' })}>
            + Add record
          </button>
        )}
      </div>

      <p className="result-count">
        {isSideSort(sort) ? (
          <>
            Showing <b>{shown.length}</b> played sides from {shownRecords.length} records
          </>
        ) : (
          <>
            Showing <b>{shown.length}</b> of {records.length}
          </>
        )}
      </p>
      {shown.length === 0 ? (
        <div className="empty">No records match.</div>
      ) : (
        <ul className="grid vinyl-grid">
          {shown.map(({ record: r, side }) => {
            // The sides shown on the badge: just this card's side when each side is its own card.
            const sides = side ? [[side.name, side.plays] as const] : playsPerSide(r.listens);
            return (
              <li key={side ? `${r.id}-${side.name}` : r.id}>
                <button className="card" onClick={() => showDetail(r.id)} title={`${r.artist} – ${r.title}${side ? `, side ${side.name}` : ''}`}>
                  <div className="card-cover">
                    <VinylCover record={r} />
                    {r.images.length > 1 && (
                      <span className="card-count" title={`${r.images.length} images`}>
                        {r.images.length}
                      </span>
                    )}
                    {sides.length > 0 && (
                      <span className="plays-badge" title={sides.map(([name, n]) => `Side ${name}: ${n} ${n === 1 ? 'play' : 'plays'}`).join('\n')}>
                        ▶
                        {sides.map(([name, n]) => (
                          <span key={name} className="side-plays">
                            <span className="side-name">{name}</span>
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <span className="card-title">
                      {r.title}
                      {side && <span className="muted"> · Side {side.name}</span>}
                    </span>
                    <span className="muted small">
                      {r.artist}
                      {sort === 'recentSides' && side?.last && ` · ${formatDate(side.last)}`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modal?.kind === 'detail' && open && (
        <VinylDetail
          record={open}
          editable={editable}
          onSaved={upsert}
          onClose={() => setModal(null)}
          onPrev={openIndex > 0 ? () => showDetail(shownRecords[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < shownRecords.length - 1 ? () => showDetail(shownRecords[openIndex + 1].id) : undefined}
          onEdit={() => setModal({ kind: 'edit', id: open.id })}
          onImages={() => setModal({ kind: 'images', id: open.id })}
          onDelete={() => remove(open)}
        />
      )}
      {modal?.kind === 'edit' && open && <VinylForm record={open} onClose={backToDetail} onSaved={(r) => (upsert(r), showDetail(r.id))} />}
      {modal?.kind === 'new' && <VinylForm record={null} onClose={() => setModal(null)} onSaved={(r) => (upsert(r), setModal({ kind: 'images', id: r.id }))} />}
      {modal?.kind === 'images' && open && (
        <ImageManager
          item={open}
          title={open.title}
          ops={VINYL_IMAGE_OPS}
          findLinks={
            <>
              <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${open.artist} ${open.title} vinyl`)}`} target="_blank" rel="noreferrer">
                Google Images
              </a>{' '}
              ·{' '}
              <a href={`https://www.discogs.com/search/?type=release&q=${encodeURIComponent(`${open.artist} ${open.title}`)}`} target="_blank" rel="noreferrer">
                Discogs
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
