import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Query } from '../types';
import { yearOf } from '../lib/query';
import { NOT_GENRES } from '../lib/allTime';
import { formatPlaytime } from '../lib/format';

interface Props {
  games: Game[];
  /** Opens the collection with these filters. */
  onShowGames: (filters: Partial<Query>) => void;
  onOpen: (game: Game) => void;
}

const BEFORE = /^before\b/i;
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return [...out];
}

/** Statuses other than Completed and Not Completed share one grey segment. */
const OTHER_STATUSES = ['Null', 'Unplayable', 'Unrateable'];

// --- Tooltip -------------------------------------------------------------------------

type Tip = { x: number; y: number; lines: string[] } | null;

/** One tooltip for the whole tab: follows the pointer, or sits above a bar focused with the keyboard. */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (lines: string[]) => ({
    onPointerMove: (e: React.PointerEvent) => e.pointerType === 'mouse' && setTip({ x: e.clientX, y: e.clientY, lines }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, lines });
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div className="sv-tip" style={{ left: Math.min(Math.max(tip.x, 110), innerWidth - 110), top: tip.y }} role="presentation">
      <b>{tip.lines[0]}</b>
      {tip.lines.slice(1).map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
  return { bind, node };
}

type Bind = ReturnType<typeof useTip>['bind'];

// --- Charts ----------------------------------------------------------------------------

/** Round axis ticks from 0 to just above `max`, about four of them. */
function ticksFor(max: number): number[] {
  const raw = Math.max(max, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out = [0];
  while (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

interface Series {
  label: string;
  /** CSS class for the fill colour. */
  cls: string;
}

interface Column {
  label: string;
  /** Long name for the tooltip and the table. */
  name: string;
  values: number[];
}

/** Vertical bars on one count axis; several series sit side by side in each column. */
function ColumnChart({ series, columns, bind, onPick, unit }: { series: Series[]; columns: Column[]; bind: Bind; onPick: (col: number, series: number) => void; unit: string }) {
  const ticks = ticksFor(Math.max(...columns.flatMap((c) => c.values)));
  const top = ticks[ticks.length - 1];
  // On a narrow screen the chart scrolls; start at the latest columns.
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth;
  }, []);
  return (
    <>
      {series.length > 1 && (
        <ul className="sv-legend">
          {series.map((s) => (
            <li key={s.label}>
              <span className={`sv-swatch ${s.cls}`} /> {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="sv-scroll" ref={scroll}>
        <div className="sv-columns" style={{ minWidth: columns.length * (series.length * 12 + 18) + 36 }}>
          <div className="sv-plot">
            {ticks.map((t) => (
              <div key={t} className="sv-tick" style={{ bottom: `${(t / top) * 100}%` }}>
                <span>{t}</span>
              </div>
            ))}
            <div className="sv-cols">
              {columns.map((c, ci) => (
                <div key={c.name} className="sv-col">
                  {c.values.map((v, si) => (
                    <button
                      key={series[si].label}
                      className="sv-vbar"
                      aria-label={`${c.name}, ${series[si].label.toLowerCase()}: ${plural(v, unit)}`}
                      disabled={!v}
                      onClick={() => onPick(ci, si)}
                      {...bind([c.name, ...series.map((s, i) => `${series.length > 1 ? `${s.label}: ` : ''}${plural(c.values[i], unit)}`)])}
                    >
                      <span className={`sv-vfill ${series[si].cls}`} style={{ height: `${(v / top) * 100}%` }} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="sv-xaxis">
            {columns.map((c) => (
              <span key={c.name}>{c.label}</span>
            ))}
          </div>
        </div>
      </div>
      <details className="sv-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th />
              {series.map((s) => (
                <th key={s.label}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.name}>
                <th>{c.name}</th>
                {c.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

interface Row {
  key: string;
  label: React.ReactNode;
  /** Segments of the bar, in order; a single one for a plain bar. */
  segments: { value: number; cls: string }[];
  /** Text after the bar. */
  detail: string;
  tip: string[];
  onClick?: () => void;
}

/** Horizontal bars, one per row, scaled to the longest. The value is printed after each bar. */
function BarList({ rows, bind, ariaLabel, labelWidth }: { rows: Row[]; bind: Bind; ariaLabel: (r: Row) => string; labelWidth?: string }) {
  const max = Math.max(...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)), 1);
  return (
    <ul className="sv-bars" style={labelWidth ? ({ '--sv-label': labelWidth } as React.CSSProperties) : undefined}>
      {rows.map((r) => {
        const total = r.segments.reduce((s, x) => s + x.value, 0);
        const body = (
          <>
            <span className="sv-bar-label">{r.label}</span>
            <span className="sv-track">
              <span className="sv-hbar" style={{ width: `${(total / max) * 100}%` }}>
                {r.segments
                  .filter((s) => s.value)
                  .map((s) => (
                    <span key={s.cls} className={`sv-seg ${s.cls}`} style={{ flexGrow: s.value }} />
                  ))}
              </span>
            </span>
            <span className="sv-bar-detail">{r.detail}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button className="sv-bar-row" onClick={r.onClick} aria-label={ariaLabel(r)} {...bind(r.tip)}>
                {body}
              </button>
            ) : (
              <div className="sv-bar-row" {...bind(r.tip)}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="sv-tile">
      <span className="eyebrow">{label}</span>
      <span className="sv-tile-value">{value}</span>
      <span className="muted">{detail}</span>
    </div>
  );
}

// --- The tab ---------------------------------------------------------------------------

export default function StatsView({ games, onShowGames, onOpen }: Props) {
  const { bind, node: tip } = useTip();

  const s = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    /** Dates in a year, up to today's day of the year. */
    const soFar = (dates: (string | null)[], y: number) => dates.filter((d) => d?.startsWith(`${y}-`) && d.slice(5) <= monthDay).length;
    const acquiredDates = games.map((g) => isoDate(g.acquired));
    const completedDates = games.map((g) => isoDate(g.completed));

    // Per year. Years with nothing in them stay on the axis, so gaps show.
    const acquired = new Map<string, number>();
    const completed = new Map<string, number>();
    for (const g of games) {
      const a = yearOf(g.acquired);
      if (a) acquired.set(a, (acquired.get(a) ?? 0) + 1);
      const c = yearOf(g.completed);
      if (c) completed.set(c, (completed.get(c) ?? 0) + 1);
    }
    const numericYears = [...acquired.keys(), ...completed.keys()].filter((y) => !BEFORE.test(y)).map(Number);
    const first = Math.min(...numericYears);
    const years: Column[] = [...acquired.keys()]
      .filter((y) => BEFORE.test(y))
      .map((y) => ({ label: 'Earlier', name: y, values: [acquired.get(y) ?? 0, completed.get(y) ?? 0] }));
    for (let y = first; y <= Math.max(year, ...numericYears); y++) {
      years.push({ label: String(y), name: String(y), values: [acquired.get(String(y)) ?? 0, completed.get(String(y)) ?? 0] });
    }

    const completedGames = games.filter((g) => g.status === 'Completed');
    const notCompleted = games.filter((g) => g.status === 'Not Completed').length;
    const rated = games.filter((g) => g.rating !== null);
    const avg = (gs: Game[]) => {
      const r = gs.filter((g) => g.rating !== null);
      return r.length ? Math.round(r.reduce((n, g) => n + g.rating!, 0) / r.length) : null;
    };

    const platforms = groupBy(games, (g) => g.platform)
      .map(([platform, gs]) => {
        const by = (st: string) => gs.filter((g) => g.status === st).length;
        const done = by('Completed');
        const open = by('Not Completed');
        return { platform, total: gs.length, done, open, other: gs.length - done - open, others: OTHER_STATUSES.map((st) => [st, by(st)] as const).filter(([, n]) => n), avg: avg(gs) };
      })
      .sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform));

    const genres = groupBy(games.flatMap((g) => g.genres.filter((t) => !NOT_GENRES.has(t)).map((t) => [t, g] as const)), ([t]) => t)
      .map(([genre, pairs]) => ({ genre, count: pairs.length, avg: avg(pairs.map(([, g]) => g)) }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

    // Ratings in tens; 90 and up is one bucket, since nothing scores 100.
    const buckets: Column[] = Array.from({ length: 10 }, (_, i) => ({ label: i === 9 ? '90+' : String(i * 10), name: i === 9 ? 'Rated 90–100' : `Rated ${i * 10}–${i * 10 + 9}`, values: [0] }));
    for (const g of rated) buckets[Math.min(Math.floor(g.rating! / 10), 9)].values[0]++;

    // What came with each game, as the exact set of parts. Built-in console games have no box of their own.
    const physical = games.filter((g) => !g.condition.includes('Built-in Console'));
    const conditions = groupBy(physical, (g) => (g.condition.length ? [...g.condition].sort().join(' + ') : 'Nothing recorded'))
      .map(([combo, gs]) => ({ combo, count: gs.length }))
      .sort((a, b) => b.count - a.count);
    const complete = physical.filter((g) => ['Box', 'Cover', 'Manual'].every((p) => g.condition.includes(p))).length;

    const played = games.filter((g) => g.playtime).sort((a, b) => b.playtime! - a.playtime!);

    return {
      year,
      todayLabel: today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      acquiredSoFar: soFar(acquiredDates, year),
      acquiredLastYear: soFar(acquiredDates, year - 1),
      completedSoFar: soFar(completedDates, year),
      completedLastYear: soFar(completedDates, year - 1),
      years,
      undatedCompletions: completedGames.filter((g) => !yearOf(g.completed)).length,
      completed: completedGames.length,
      completable: completedGames.length + notCompleted,
      platforms,
      genres,
      buckets,
      unrated: games.length - rated.length,
      physical: physical.length,
      builtIn: games.length - physical.length,
      conditions,
      complete,
      played,
      minutes: played.reduce((n, g) => n + g.playtime!, 0),
    };
  }, [games]);

  const versus = (now: number, then: number) => `${then} by ${s.todayLabel} ${s.year - 1}${now === then ? '' : ` (${now > then ? '+' : '−'}${Math.abs(now - then)})`}`;

  return (
    <div className="stats-view">
      <section className="sv-tiles" aria-label="Highlights">
        <Tile label={`Acquired in ${s.year}`} value={String(s.acquiredSoFar)} detail={versus(s.acquiredSoFar, s.acquiredLastYear)} />
        <Tile label={`Completed in ${s.year}`} value={String(s.completedSoFar)} detail={versus(s.completedSoFar, s.completedLastYear)} />
        <Tile label="Completion rate" value={pct(s.completed, s.completable)} detail={`${s.completed} of ${s.completable} completable games`} />
        <Tile label="Complete in box" value={pct(s.complete, s.physical)} detail={`${s.complete} of ${s.physical} games with box, cover and manual`} />
        <Tile label="Play time tracked" value={`${Math.round(s.minutes / 60)}h`} detail={`across ${plural(s.played.length, 'game')}`} />
      </section>

      <section className="sv-card sv-wide">
        <h2 className="section-title">Acquired and completed per year</h2>
        <ColumnChart
          series={[
            { label: 'Acquired', cls: 'sv-a' },
            { label: 'Completed', cls: 'sv-b' },
          ]}
          columns={s.years}
          unit="game"
          bind={bind}
          onPick={(ci, si) => onShowGames(si === 0 ? { acquiredYears: [s.years[ci].name] } : { completedYears: [s.years[ci].name] })}
        />
        <p className="sv-note muted">
          Click a bar to see its games. {s.undatedCompletions ? `${plural(s.undatedCompletions, 'completed game')} without a completion date ${s.undatedCompletions === 1 ? "isn't" : "aren't"} counted.` : ''}
        </p>
      </section>

      <div className="sv-stack">
        <section className="sv-card">
          <h2 className="section-title">Platforms</h2>
          <ul className="sv-legend">
            <li><span className="sv-swatch sv-b" /> Completed</li>
            <li><span className="sv-swatch sv-a" /> Not completed</li>
            <li><span className="sv-swatch sv-rest" /> {OTHER_STATUSES.join(', ')}</li>
          </ul>
          <BarList
            bind={bind}
            ariaLabel={(r) => `${r.key}: ${r.tip.slice(1).join(', ')}. Show its games.`}
            rows={s.platforms.map((p) => ({
              key: p.platform,
              label: p.platform,
              segments: [
                { value: p.done, cls: 'sv-b' },
                { value: p.open, cls: 'sv-a' },
                { value: p.other, cls: 'sv-rest' },
              ],
              detail: `${p.total} · ${pct(p.done, p.done + p.open)}`,
              tip: [
                p.platform,
                plural(p.total, 'game'),
                `Completed: ${p.done}`,
                `Not completed: ${p.open}`,
                ...p.others.map(([st, n]) => `${st}: ${n}`),
                `Completion rate: ${pct(p.done, p.done + p.open)}`,
                `Average rating: ${p.avg ?? '—'}`,
              ],
              onClick: () => onShowGames({ platforms: [p.platform] }),
            }))}
          />
          <p className="sv-note muted">The percentage is completed games out of completed and not completed ones.</p>
        </section>

        <section className="sv-card">
          <h2 className="section-title">Most played</h2>
          {s.played.length ? (
            <BarList
              bind={bind}
              ariaLabel={(r) => `${r.tip.join(', ')}. Open the game.`}
              labelWidth="16em"
              rows={s.played.slice(0, 10).map((g) => ({
                key: String(g.id),
                label: (
                  <>
                    {g.title} <span className="muted">{g.platform}</span>
                  </>
                ),
                segments: [{ value: g.playtime!, cls: 'sv-a' }],
                detail: formatPlaytime(g.playtime),
                tip: [g.title, g.platform, formatPlaytime(g.playtime)],
                onClick: () => onOpen(g),
              }))}
            />
          ) : (
            <p className="muted">No play time recorded yet.</p>
          )}
          <p className="sv-note muted">Only games with recorded play time are counted.</p>
        </section>
      </div>

      <div className="sv-stack">
        <section className="sv-card">
          <h2 className="section-title">Ratings</h2>
          <ColumnChart
            series={[{ label: 'Games', cls: 'sv-a' }]}
            columns={s.buckets}
            unit="game"
            bind={bind}
            onPick={(ci) => onShowGames({ ratingMin: ci * 10, ratingMax: ci === 9 ? 100 : ci * 10 + 9 })}
          />
          <p className="sv-note muted">{plural(s.unrated, 'game')} without a rating {s.unrated === 1 ? "isn't" : "aren't"} counted.</p>
        </section>

        <section className="sv-card">
          <h2 className="section-title">Genres</h2>
          <BarList
            bind={bind}
            ariaLabel={(r) => `${r.key}: ${r.tip.slice(1).join(', ')}. Show its games.`}
            rows={s.genres.map((g) => ({
              key: g.genre,
              label: g.genre,
              segments: [{ value: g.count, cls: 'sv-a' }],
              detail: `${g.count} · avg ${g.avg ?? '—'}`,
              tip: [g.genre, plural(g.count, 'game'), `Average rating: ${g.avg ?? '—'}`],
              onClick: () => onShowGames({ genres: [g.genre] }),
            }))}
          />
        </section>

        <section className="sv-card">
          <h2 className="section-title">What came in the box</h2>
          <BarList
            bind={bind}
            ariaLabel={(r) => r.tip.join(': ')}
            labelWidth="12em"
            rows={s.conditions.map((c) => ({
              key: c.combo,
              label: c.combo,
              segments: [{ value: c.count, cls: 'sv-a' }],
              detail: `${c.count} · ${pct(c.count, s.physical)}`,
              tip: [c.combo, `${plural(c.count, 'game')}, ${pct(c.count, s.physical)} of ${s.physical}`],
            }))}
          />
          <p className="sv-note muted">{plural(s.builtIn, 'game')} built into a console {s.builtIn === 1 ? "isn't" : "aren't"} counted.</p>
        </section>
      </div>

      {tip}
    </div>
  );
}
