import { useMemo } from 'react';
import type { Vinyl } from '../types';
import { formatDate } from '../lib/format';
import { ActivityCalendar, daysBetween, toIso } from './ActivityCalendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

/** A calendar of the days records were played, with streaks and favourites; nothing until a listen has a date. */
export function VinylListening({ records }: { records: Vinyl[] }) {
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

    const plays = [...byDay.values()].flat();
    const all = records.flatMap((record) => record.listens.map((l) => ({ record, side: l.side })));
    const topRecord = top(all, (p) => String(p.record.id));
    return {
      today,
      byDay,
      days,
      undated,
      dated: plays.length,
      total: all.length,
      ...streaks(days, today),
      topArtist: top(all, (p) => p.record.artist),
      topRecord: topRecord && { record: records.find((r) => String(r.id) === topRecord[0])!, sides: topRecord[1] },
    };
  }, [records]);

  if (!s) return null;

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

      <ActivityCalendar
        title="Listening calendar"
        count={(day) => s.byDay.get(day)?.length ?? 0}
        describe={(day) => {
          const plays = s.byDay.get(day) ?? [];
          return [
            formatDate(day),
            plays.length ? `${plural(plays.length, 'side')} played` : 'Nothing played',
            ...plays.map((p) => `${p.record.artist} – ${p.record.title} · Side ${p.side}`),
          ];
        }}
        label={(since) => `${plural(s.dated, 'side')} played on ${plural(s.days.length, 'day')} since ${formatDate(since)}`}
        note={
          <>
            {plural(s.dated, 'side')} on {plural(s.days.length, 'day')}.
            {s.undated > 0 && ` ${plural(s.undated, 'listen')} without a date ${s.undated === 1 ? "isn't" : "aren't"} shown.`}
          </>
        }
      />
    </section>
  );
}
