import { useLayoutEffect, useRef, useState } from 'react';

type Tip = { x: number; y: number; lines: string[] } | null;

/** One tooltip for a whole view: follows the pointer, or sits above a bar focused with the keyboard. */
export function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  // Keep the whole tooltip on screen, however wide its lines make it.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const half = box.current.offsetWidth / 2 + 8;
    box.current.style.left = `${Math.min(Math.max(tip.x, half), innerWidth - half)}px`;
  }, [tip]);
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
    <div ref={box} className="sv-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      <b>{tip.lines[0]}</b>
      {tip.lines.slice(1).map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
  return { bind, node };
}

export type Bind = ReturnType<typeof useTip>['bind'];
