import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTip } from '../lib/tip';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The calendar shows the past year, a week to a column. */
const WEEKS = 53;

/** yyyy-mm-dd in local time. */
export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Dates at local noon, so adding days never trips over a clock change. */
export const fromIso = (iso: string) => new Date(`${iso}T12:00:00`);
export const addDays = (iso: string, n: number) => toIso(new Date(fromIso(iso).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY);

/** Shade for a day: 0 for nothing, then 1–4 as more happened. */
const defaultLevel = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);

interface Props {
  title: string;
  /** How much happened on a day (yyyy-mm-dd); sets its shade. */
  count: (day: string) => number;
  /** The tooltip's lines for a past day. */
  describe: (day: string) => string[];
  /** Read out in place of the squares. */
  label: (since: string) => string;
  /** The line under the calendar, beside the legend. */
  note: React.ReactNode;
  /** Shade 0–4 for a count, when the default steps (1, 2, 3–4, 5+) don't suit. */
  level?: (n: number) => number;
  /**
   * Every year on one calendar: the days of a leap year (2024, which starts on a Monday), no weekdays,
   * and today ringed. Days are still passed as 2024's yyyy-mm-dd; read the mm-dd.
   */
  allYears?: boolean;
  /** Makes days clickable. */
  onPick?: (day: string) => void;
}

/** A GitHub-style year: a column of days per week, Monday to Sunday, the last column this week. */
export function ActivityCalendar({ title, count, describe, label, note, level = defaultLevel, allYears = false, onPick }: Props) {
  const { bind, node: tip } = useTip();
  const scroller = useRef<HTMLDivElement>(null);

  const { today, weeks, monthLabels } = useMemo(() => {
    const now = toIso(new Date());
    const today = allYears ? `2024-${now.slice(5)}` : now;
    const lastMonday = addDays(today, -((fromIso(today).getDay() + 6) % 7));
    const firstMonday = allYears ? '2024-01-01' : addDays(lastMonday, -7 * (WEEKS - 1));
    const weeks = Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)).filter((d) => !allYears || d.startsWith('2024')),
    );

    // A month's name goes over the week its 1st falls in, if there's room after the previous name.
    const monthLabels: { week: number; label: string }[] = [];
    weeks.forEach((week, w) => {
      const first = week.find((d) => d.endsWith('-01'));
      const prev = monthLabels[monthLabels.length - 1];
      if (first && (!prev || w - prev.week >= 3)) monthLabels.push({ week: w, label: MONTHS[Number(first.slice(5, 7)) - 1] });
    });
    return { today, weeks, monthLabels };
  }, [allYears]);

  // Start scrolled to the latest weeks (or, for every year, today's) when the calendar is wider than the screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ring = el.querySelector<HTMLElement>('.lc-today');
    el.scrollLeft = allYears && ring ? ring.offsetLeft - el.clientWidth / 2 : el.scrollWidth;
  }, [allYears]);

  // The first week's column: after the day names, when there are any.
  const first = allYears ? 1 : 2;
  return (
    <div className="sv-card listen-calendar-card">
      <h2 className="section-title">{title}</h2>
      <div className="listen-calendar-scroll" ref={scroller}>
        {/* One grid: month names on top, day names on the left, then a column of days per week. */}
        <div className={`listen-calendar${allYears ? ' lc-all-years' : ''}`} style={{ '--weeks': weeks.length } as React.CSSProperties} role="img" aria-label={label(weeks[0][0])}>
          {monthLabels.map((m) => (
            <span key={m.week} className="lc-month" style={{ gridColumn: m.week + first }}>
              {m.label}
            </span>
          ))}
          {(allYears ? [] : ['Mon', 'Wed', 'Fri']).map((d, i) => (
            <span key={d} className="lc-weekday" style={{ gridRow: i * 2 + 2 }}>
              {d}
            </span>
          ))}
          {weeks.map((week, w) =>
            week.map((day, d) => {
              const at = { gridColumn: w + first, gridRow: d + 2 };
              if (day > today && !allYears) return <span key={day} className="lc-day lc-future" style={at} />;
              const className = `lc-day lc-${level(count(day))}${allYears && day === today ? ' lc-today' : ''}`;
              return onPick ? (
                <button key={day} className={className} style={at} onClick={() => onPick(day)} aria-label={describe(day)[0]} {...bind(describe(day))} />
              ) : (
                <span key={day} className={className} style={at} {...bind(describe(day))} />
              );
            }),
          )}
        </div>
      </div>
      <div className="lc-foot">
        <p className="sv-note muted">{note}</p>
        <span className="lc-legend muted" aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`lc-day lc-${l}`} />
          ))}
          More
        </span>
      </div>
      {tip}
    </div>
  );
}
