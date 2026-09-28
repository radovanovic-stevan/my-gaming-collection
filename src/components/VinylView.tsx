import { useMemo, useState } from 'react';
import type { Vinyl } from '../types';
import { api } from '../lib/api';
import { imageUrl, platformHue } from '../lib/format';
import { ImageManager, type ImageOps } from './ImageManager';
import { VinylDetail } from './VinylDetail';
import { VinylForm } from './VinylForm';

interface Props {
  records: Vinyl[];
  /** Local editing (dev server only). */
  editable: boolean;
  onChange: (records: Vinyl[]) => void;
}

type SortKey = 'artist' | 'title' | 'plays' | 'recent' | 'added';
const SORTS: Record<SortKey, string> = { artist: 'Artist', title: 'Title', plays: 'Most played', recent: 'Last played', added: 'Recently added' };

type Modal = { kind: 'detail' | 'edit' | 'images'; id: number } | { kind: 'new' } | null;

const VINYL_IMAGE_OPS: ImageOps<Vinyl> = { add: api.addVinylImage, remove: api.removeVinylImage, setCover: api.setVinylCover };

const lastPlayed = (r: Vinyl) => r.listens.reduce<string>((max, l) => (l.date && l.date > max ? l.date : max), '');
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function sortRecords(records: Vinyl[], key: SortKey): Vinyl[] {
  const artistThenTitle = (a: Vinyl, b: Vinyl) => byText(a.artist, b.artist) || byText(a.title, b.title);
  const compare: Record<SortKey, (a: Vinyl, b: Vinyl) => number> = {
    artist: artistThenTitle,
    title: (a, b) => byText(a.title, b.title) || artistThenTitle(a, b),
    plays: (a, b) => b.listens.length - a.listens.length || artistThenTitle(a, b),
    // Records without a dated listen go last.
    recent: (a, b) => lastPlayed(b).localeCompare(lastPlayed(a)) || artistThenTitle(a, b),
    added: (a, b) => b.id - a.id,
  };
  return [...records].sort(compare[key]);
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

export function VinylView({ records, editable, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('artist');
  const [undatedOnly, setUndatedOnly] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const undatedCount = useMemo(() => records.reduce((n, r) => n + r.listens.filter((l) => !l.date).length, 0), [records]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = records.filter(
      (r) => (!q || `${r.artist} ${r.title}`.toLowerCase().includes(q)) && (!undatedOnly || r.listens.some((l) => !l.date)),
    );
    return sortRecords(matching, sort);
  }, [records, search, sort, undatedOnly]);

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
  const openIndex = open ? shown.findIndex((r) => r.id === open.id) : -1;
  const showDetail = (id: number) => setModal({ kind: 'detail', id });
  const backToDetail = () => setModal((m) => (m && m.kind !== 'new' ? { kind: 'detail', id: m.id } : null));

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
        Showing <b>{shown.length}</b> of {records.length}
      </p>
      {shown.length === 0 ? (
        <div className="empty">No records match.</div>
      ) : (
        <ul className="grid vinyl-grid">
          {shown.map((r) => (
            <li key={r.id}>
              <button className="card" onClick={() => showDetail(r.id)} title={`${r.artist} – ${r.title}`}>
                <div className="card-cover">
                  <VinylCover record={r} />
                  {r.images.length > 1 && (
                    <span className="card-count" title={`${r.images.length} images`}>
                      {r.images.length}
                    </span>
                  )}
                  {r.listens.length > 0 && (
                    <span className="plays-badge" title={`${r.listens.length} ${r.listens.length === 1 ? 'side played' : 'sides played'}`}>
                      ▶ {r.listens.length}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <span className="card-title">{r.title}</span>
                  <span className="muted small">{r.artist}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {modal?.kind === 'detail' && open && (
        <VinylDetail
          record={open}
          editable={editable}
          onSaved={upsert}
          onClose={() => setModal(null)}
          onPrev={openIndex > 0 ? () => showDetail(shown[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < shown.length - 1 ? () => showDetail(shown[openIndex + 1].id) : undefined}
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
