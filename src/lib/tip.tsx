import { useState } from 'react';

type Tip = { x: number; y: number; lines: string[] } | null;

/** One tooltip for a whole view: follows the pointer, or sits above a bar focused with the keyboard. */
export function useTip() {
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

export type Bind = ReturnType<typeof useTip>['bind'];
