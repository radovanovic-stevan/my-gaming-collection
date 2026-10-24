import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Vinyl } from '../types';
import { formatDate } from '../lib/format';
import { useTip } from '../lib/tip';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The calendar shows the past year, a week to a column. */
const WEEKS = 53;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** yyyy-mm-dd in local time. */
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Dates at local noon, so adding days never trips over a clock change. */
const fromIso = (iso: string) => new Date(`${iso}T12:00:00`);
const addDays = (iso: string, n: number) => toIso(new Date(fromIso(iso).getTime() + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY);

type Play = { record: Vinyl; side: string };

/** The longest run of consecutive days with a listen, and the run that reaches today or yesterday. */
function streaks(days: string[], today: string) {
  let best = { length: 0, from: '', to: '' };
  let run = { length: 0, from: '', to: '' };
  for (const d of days) {
    run = run.length && daysBetween(run.to, d) === 1 ? { ...run, length: run.length + 1, to: d } : { length: 1, from: d, to: d };
    if (run.length > best.length) best = run;
  }
  const current = run.length && daysBetween(run.to, today) <= 1 ? run : null;
  return { best, current };
}

/** The most common key with its count; ties go to the one reached first. */
function top<T>(items: T[], key: (item: T) => string): [string, number] | null {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].reduce<[string, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null);
}

/** Shade for a day: 0 for none, then 1–4 as more sides were played. */
const level = (sides: number) => (sides === 0 ? 0 : sides === 1 ? 1 : sides === 2 ? 2 : sides <= 4 ? 3 : 4);

/** A calendar of the days records were played, with streaks and favourites; nothing until a listen has a date. */
export function VinylListening({ records }: { records: Vinyl[] }) {
  const { bind, node: tip } = useTip();
  const scroller = useRef<HTMLDivElement>(null);

  const s = useMemo(() => {
    const today = toIso(new Date());
    const byDay = new Map<string, Play[]>();
    let undated = 0;
    for (const record of records)
      for (const l of record.listens) {
        if (l.date && ISO.test(l.date)) byDay.set(l.date, [...(byDay.get(l.date) ?? []), { record, side: l.side }]);
        else undated++;
      }
    const days = [...byDay.keys()].sort();
    if (!days.length) return null;

    // Weeks run Monday to Sunday; the last column is this week.
    const lastMonday = addDays(today, -((fromIso(today).getDay() + 6) % 7));
    const firstMonday = addDays(lastMonday, -7 * (WEEKS - 1));
    const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)));

    // A month's name goes over the week its 1st falls in, if there's room after the previous name.
    const monthLabels: { week: number; label: string }[] = [];
    weeks.forEach((week, w) => {
      const first = week.find((d) => d.endsWith('-01'));
      const prev = monthLabels[monthLabels.length - 1];
      if (first && (!prev || w - prev.week >= 3)) monthLabels.push({ week: w, label: MONTHS[Number(first.slice(5, 7)) - 1] });
    });

    const plays = [...byDay.values()].flat();
    const all = records.flatMap((record) => record.listens.map((l) => ({ record, side: l.side })));
    const topRecord = top(all, (p) => String(p.record.id));
    return {
      today,
      byDay,
      weeks,
      monthLabels,
      days,
      undated,
      dated: plays.length,
      total: all.length,
      ...streaks(days, today),
      topArtist: top(all, (p) => p.record.artist),
      topRecord: topRecord && { record: records.find((r) => String(r.id) === topRecord[0])!, sides: topRecord[1] },
    };
  }, [records]);

  // Start scrolled to the latest weeks when the calendar is wider than the screen.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [s?.weeks.length]);

  if (!s) return null;

  const since = s.weeks[0][0];
  return (
    <section className="vinyl-listening" aria-label="Listening">
      <div className="sv-tiles">
        <div className="sv-tile">
          <span className="eyebrow">Days listened</span>
          <span className="sv-tile-value">{s.days.length}</span>
          <span className="muted">since {formatDate(s.days[0])}</span>
        </div>
        <div className="sv-tile">
          <span className="eyebrow">Current streak</span>
          <span className="sv-tile-value">{plural(s.current?.length ?? 0, 'day')}</span>
          <span className="muted">{s.current ? `in a row, up to ${s.current.to === s.today ? 'today' : 'yesterday'}` : 'nothing played yesterday or today'}</span>
        </div>
        <div className="sv-tile">
          <span className="eyebrow">Longest streak</span>
          <span className="sv-tile-value">{plural(s.best.length, 'day')}</span>
          <span className="muted">{s.best.length > 1 ? `${formatDate(s.best.from)} – ${formatDate(s.best.to)}` : formatDate(s.best.from)}</span>
        </div>
        {s.topArtist && (
          <div className="sv-tile">
            <span className="eyebrow">Top artist</span>
            <span className="sv-tile-value vinyl-tile-text">{s.topArtist[0]}</span>
            <span className="muted">{plural(s.topArtist[1], 'side')} played</span>
          </div>
        )}
        {s.topRecord && (
          <div className="sv-tile">
            <span className="eyebrow">Top record</span>
            <span className="sv-tile-value vinyl-tile-text">{s.topRecord.record.title}</span>
            <span className="muted">
              {s.topRecord.record.artist} · {plural(s.topRecord.sides, 'side')}
            </span>
          </div>
        )}
      </div>

      <div className="sv-card listen-calendar-card">
        <h2 className="section-title">Listening calendar</h2>
        <div className="listen-calendar-scroll" ref={scroller}>
          {/* One grid: month names on top, day names on the left, then a column of days per week. */}
          <div
            className="listen-calendar"
            style={{ '--weeks': s.weeks.length } as React.CSSProperties}
            role="img"
            aria-label={`${plural(s.dated, 'side')} played on ${plural(s.days.length, 'day')} since ${formatDate(since)}`}
          >
            {s.monthLabels.map((m) => (
              <span key={m.week} className="lc-month" style={{ gridColumn: m.week + 2 }}>
                {m.label}
              </span>
            ))}
            {['Mon', 'Wed', 'Fri'].map((d, i) => (
              <span key={d} className="lc-weekday" style={{ gridRow: i * 2 + 2 }}>
                {d}
              </span>
            ))}
            {s.weeks.map((week, w) =>
              week.map((day, d) => {
                const at = { gridColumn: w + 2, gridRow: d + 2 };
                if (day > s.today) return <span key={day} className="lc-day lc-future" style={at} />;
                const plays = s.byDay.get(day) ?? [];
                const lines = [
                  formatDate(day),
                  plays.length ? `${plural(plays.length, 'side')} played` : 'Nothing played',
                  ...plays.map((p) => `${p.record.artist} – ${p.record.title} · Side ${p.side}`),
                ];
                return <span key={day} className={`lc-day lc-${level(plays.length)}`} style={at} {...bind(lines)} />;
              }),
            )}
          </div>
        </div>
        <div className="lc-foot">
          <p className="sv-note muted">
            {plural(s.dated, 'side')} on {plural(s.days.length, 'day')}.
            {s.undated > 0 && ` ${plural(s.undated, 'listen')} without a date ${s.undated === 1 ? "isn't" : "aren't"} shown.`}
          </p>
          <span className="lc-legend muted" aria-hidden="true">
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`lc-day lc-${l}`} />
            ))}
            More
          </span>
        </div>
      </div>
      {tip}
    </section>
  );
}
