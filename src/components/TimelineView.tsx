import { useMemo, useState } from 'react';
import type { Game } from '../types';
import { EVENT_LABELS, buildTimeline, type EventGame, type EventKind, type TimelineEvent, type TimelineSources } from '../lib/timeline';
import { formatMonthYear, imageUrl } from '../lib/format';
import { PlatformBadge, RatingBadge } from './Badges';
import { RefCover } from './GameRefView';

/** Where an event's own page is: a picture in the gallery, a blog post, or a game's launcher trophies (by collection game id). */
export type OpenTarget = 'gallery' | 'blog' | 'casting-a-dream';

interface Props extends TimelineSources {
  onOpen: (game: Game) => void;
  onOpenIn: (tab: OpenTarget, id: number) => void;
}

const KINDS = Object.keys(EVENT_LABELS) as EventKind[];
/** Games listed in one event before the rest are folded away. */
const FOLD = 12;

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- One event -----------------------------------------------------------------------------

function GameChip({ entry, onOpen }: { entry: EventGame; onOpen: Props['onOpen'] }) {
  const body = (
    <>
      <span className="tl-thumb tl-thumb-small">
        <RefCover entry={entry.ref} game={entry.game} />
      </span>
      <span className="tl-chip-title">{entry.ref.title}</span>
    </>
  );
  return entry.game ? (
    <button className="tl-chip" onClick={() => onOpen(entry.game!)} title={`${entry.ref.title} (${entry.ref.platform})`}>
      {body}
    </button>
  ) : (
    <span className="tl-chip" title={`${entry.ref.title} (${entry.ref.platform}), not in the collection`}>
      {body}
    </span>
  );
}

function GameList({ games, onOpen }: { games: EventGame[]; onOpen: Props['onOpen'] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? games : games.slice(0, FOLD);
  return (
    <div className="tl-chips">
      {shown.map((g) => (
        <GameChip key={`${g.ref.title}|${g.ref.platform}`} entry={g} onOpen={onOpen} />
      ))}
      {games.length > shown.length && (
        <button className="tl-more" onClick={() => setOpen(true)}>
          +{games.length - shown.length} more
        </button>
      )}
    </div>
  );
}

function SingleGame({ entry, kind, onOpen }: { entry: EventGame; kind: EventKind; onOpen: Props['onOpen'] }) {
  const body = (
    <>
      <span className="tl-thumb">
        <RefCover entry={entry.ref} game={entry.game} />
      </span>
      <span className="tl-game-text">
        <span className="tl-game-title">{entry.ref.title}</span>
        <span className="tl-game-meta">
          <PlatformBadge platform={entry.ref.platform} />
          {kind !== 'acquired' && entry.game?.rating != null && <RatingBadge rating={entry.game.rating} />}
        </span>
      </span>
    </>
  );
  return entry.game ? (
    <button className="tl-game" onClick={() => onOpen(entry.game!)}>
      {body}
    </button>
  ) : (
    <div className="tl-game">{body}</div>
  );
}

/** The first paragraph of a post, cut at a word near `max` characters. */
function excerpt(body: string, max = 180): string {
  const first = body.split(/\n\s*\n/)[0].trim();
  if (first.length <= max) return first;
  return `${first.slice(0, first.lastIndexOf(' ', max))}…`;
}

function EventRow({ event, lead, onOpen, onOpenIn }: { event: TimelineEvent; lead: string; onOpen: Props['onOpen']; onOpenIn: Props['onOpenIn'] }) {
  const { kind, games, photo, post, trophies } = event;
  const many = games.length > 1 && (kind === 'acquired' || kind === 'completed');
  return (
    <li className={`tl-event tl-${kind}`}>
      <span className="tl-lead">{lead}</span>
      <div className="tl-body">
        <span className="tl-kind">
          <span className="tl-dot" aria-hidden="true" />
          {EVENT_LABELS[kind]}
          {many && <span className="muted"> · {plural(games.length, 'game')}</span>}
          {trophies && trophies.length > 1 && <span className="muted"> · {trophies.length} trophies</span>}
          {event.when && <span className="muted"> · {event.when}</span>}
        </span>
        {post ? (
          <div className="tl-media">
            {post.cover && (
              <button className="tl-photo-image" onClick={() => onOpenIn('blog', post.id)} tabIndex={-1} aria-hidden="true">
                <img src={imageUrl(post.cover)} alt="" loading="lazy" decoding="async" />
              </button>
            )}
            <div className="tl-photo-text">
              <button className="tl-post-title" onClick={() => onOpenIn('blog', post.id)}>
                {post.title}
              </button>
              <p>{excerpt(post.body)}</p>
            </div>
          </div>
        ) : photo ? (
          <div className="tl-media">
            <button className="tl-photo-image" onClick={() => onOpenIn('gallery', photo.id)} aria-label={`Open the picture: ${photo.description || 'untitled'}`}>
              <img src={imageUrl(photo.image)} alt="" loading="lazy" decoding="async" />
            </button>
            <div className="tl-photo-text">
              {photo.description && <p>{photo.description}</p>}
              {games.length > 0 && <GameList games={games} onOpen={onOpen} />}
            </div>
          </div>
        ) : trophies ? (
          <>
            <SingleGame entry={games[0]} kind={kind} onOpen={onOpen} />
            <ul className="tl-trophies">
              {trophies.map((t, i) => (
                <li key={i}>🏆 {t}</li>
              ))}
            </ul>
            {games[0].game && (
              <button className="tl-link" onClick={() => onOpenIn('casting-a-dream', games[0].game!.id)}>
                All trophies
              </button>
            )}
          </>
        ) : games.length === 1 ? (
          <SingleGame entry={games[0]} kind={kind} onOpen={onOpen} />
        ) : (
          <GameList games={games} onOpen={onOpen} />
        )}
      </div>
    </li>
  );
}

// --- On this day ---------------------------------------------------------------------------------

function OnThisDay({ events, onOpen, onOpenIn }: { events: TimelineEvent[]; onOpen: Props['onOpen']; onOpenIn: Props['onOpenIn'] }) {
  const today = new Date();
  const todayIso = isoOf(today);
  // Day and month only; 2024 is a leap year, so 29 February can be picked too.
  const [date, setDate] = useState(() => new Date(2024, today.getMonth(), today.getDate()));
  const monthDay = isoOf(date).slice(5);
  const isToday = monthDay === todayIso.slice(5);
  const step = (days: number) => setDate((d) => new Date(2024, d.getMonth(), d.getDate() + days));

  const byYear = useMemo(() => {
    const out = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      if (!e.day || e.day.slice(5) !== monthDay || e.day > todayIso) continue;
      out.set(e.day.slice(0, 4), [...(out.get(e.day.slice(0, 4)) ?? []), e]);
    }
    return [...out];
  }, [events, monthDay, todayIso]);

  const ago = (year: string) => {
    const n = today.getFullYear() - Number(year);
    return n === 0 ? (isToday ? 'Today' : 'This year') : `${plural(n, 'year')} ago`;
  };

  return (
    <section className="tl-today" aria-labelledby="tl-today-title">
      <div className="tl-today-head">
        <div>
          <span className="eyebrow">On this day</span>
          <h2 id="tl-today-title">{dayFmt.format(date)}</h2>
        </div>
        <div className="tl-today-nav">
          {!isToday && (
            <button className="btn" onClick={() => setDate(new Date(2024, today.getMonth(), today.getDate()))}>
              Today
            </button>
          )}
          <button className="btn" onClick={() => step(-1)} aria-label="Previous day">
            ‹
          </button>
          <button className="btn" onClick={() => step(1)} aria-label="Next day">
            ›
          </button>
        </div>
      </div>
      {byYear.length ? (
        byYear.map(([year, list]) => (
          <div key={year} className="tl-today-year">
            <h3>
              {year} <span className="muted">· {ago(year)}</span>
            </h3>
            <ul className="tl-events">
              {list.map((e) => (
                <EventRow key={`${e.kind}|${e.key}|${e.photo?.id ?? e.post?.id ?? e.games[0]?.ref.title ?? ''}`} event={e} lead="" onOpen={onOpen} onOpenIn={onOpenIn} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="muted">Nothing happened on {dayFmt.format(date)} in earlier years.</p>
      )}
    </section>
  );
}

// --- The tab ----------------------------------------------------------------------------------------

interface YearGroup {
  year: string;
  /** Game of the Year, shown with the year's heading. */
  top: TimelineEvent[];
  months: { month: string; events: TimelineEvent[] }[];
  acquired: number;
  completed: number;
}

export default function TimelineView({ games, months, awards, gallery, blog, launcher, link, onOpen, onOpenIn }: Props) {
  const events = useMemo(
    () => buildTimeline({ games, months, awards, gallery, blog, launcher, link }),
    [games, months, awards, gallery, blog, launcher, link],
  );
  const [kinds, setKinds] = useState<Set<EventKind>>(() => new Set(KINDS));
  const counts = useMemo(() => new Map(KINDS.map((k) => [k, events.filter((e) => e.kind === k).reduce((n, e) => n + (k === 'acquired' || k === 'completed' ? e.games.length : 1), 0)])), [events]);

  const years = useMemo(() => {
    const out: YearGroup[] = [];
    for (const e of events) {
      const year = e.key === '0000' ? e.when! : e.key.slice(0, 4);
      let group = out[out.length - 1];
      if (group?.year !== year) out.push((group = { year, top: [], months: [], acquired: 0, completed: 0 }));
      if (e.kind === 'acquired') group.acquired += e.games.length;
      if (e.kind === 'completed') group.completed += e.games.length;
      if (!kinds.has(e.kind)) continue;
      if (e.kind === 'goty') {
        group.top.push(e);
        continue;
      }
      // yyyy-mm-dd and yyyy-mm-00 have a month; yyyy-00 and "Before" don't.
      const month = e.key.length > 7 ? e.key.slice(0, 7) : '';
      const last = group.months[group.months.length - 1];
      if (last?.month === month) last.events.push(e);
      else group.months.push({ month, events: [e] });
    }
    return out.filter((g) => g.top.length || g.months.length);
  }, [events, kinds]);

  const toggle = (k: EventKind) =>
    setKinds((ks) => {
      const next = new Set(ks);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="timeline">
      <OnThisDay events={events} onOpen={onOpen} onOpenIn={onOpenIn} />

      <div className="tl-toolbar">
        <div className="tl-filters" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k} className={`tl-filter tl-${k} ${kinds.has(k) ? 'on' : ''}`} aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>
              <span className="tl-dot" aria-hidden="true" />
              {EVENT_LABELS[k]} <span className="muted">{counts.get(k)}</span>
            </button>
          ))}
        </div>
        {years.length > 1 && (
          <select
            className="tl-jump"
            aria-label="Jump to year"
            value=""
            onChange={(e) => document.getElementById(`tl-year-${e.target.value}`)?.scrollIntoView({ behavior: 'smooth' })}
          >
            <option value="" disabled>
              Year
            </option>
            {years.map((g) => (
              <option key={g.year} value={g.year}>
                {g.year}
              </option>
            ))}
          </select>
        )}
      </div>

      {years.length === 0 && <div className="empty">Nothing to show. Pick something above.</div>}
      {years.map((g) => (
        <section key={g.year} className="tl-year" id={`tl-year-${g.year}`} aria-labelledby={`tl-year-title-${g.year}`}>
          <header className="tl-year-head">
            <h2 id={`tl-year-title-${g.year}`}>{g.year}</h2>
            <span className="muted">
              {g.acquired} acquired · {g.completed} completed
            </span>
          </header>
          {g.top.length > 0 && (
            <ul className="tl-events">
              {g.top.map((e) => (
                <EventRow key={e.key} event={e} lead="" onOpen={onOpen} onOpenIn={onOpenIn} />
              ))}
            </ul>
          )}
          {g.months.map((m) => (
            <div key={m.month} className="tl-month">
              <h3>{m.month ? formatMonthYear(m.month) : 'Month unknown'}</h3>
              <ul className="tl-events">
                {m.events.map((e) => (
                  <EventRow key={`${e.kind}|${e.key}|${e.when ?? ''}|${e.photo?.id ?? e.post?.id ?? (e.kind === 'trophy' ? e.games[0].ref.title : '')}`} event={e} lead={e.day ? String(Number(e.day.slice(8))) : ''} onOpen={onOpen} onOpenIn={onOpenIn} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
