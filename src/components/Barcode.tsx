import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Query } from '../types';
import { buildBarcode, stripeColour, type Barcode as BarcodeData } from '../lib/barcode';
import { formatDate } from '../lib/format';
import type { Bind } from '../lib/tip';

interface Props {
  games: Game[];
  bind: Bind;
  onOpen: (game: Game) => void;
  onShowGames: (filters: Partial<Query>) => void;
}

/** The barcode's height on screen. */
const HEIGHT = 170;
/** A year gets a label only if it starts this many pixels past the last labelled one. */
const LABEL_GAP = 42;

const FONT = `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`;

/**
 * Stripes across `w` pixels, one per game. Boundaries are floored off the full width rather than stepped by a
 * stripe width, so the stripes stay flush: at a pixel each, rounding every stripe on its own leaves gaps.
 */
function paintStripes(ctx: CanvasRenderingContext2D, data: BarcodeData, x: number, y: number, w: number, h: number) {
  const n = data.stripes.length;
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor((i * w) / n);
    const x1 = Math.max(Math.floor(((i + 1) * w) / n), x0 + 1);
    ctx.fillStyle = stripeColour(data.stripes[i].game.platform);
    ctx.fillRect(x + x0, y, x1 - x0, h);
  }
}

/** The poster, drawn at print size on its own canvas. Always light: it is made to be printed. */
function paintPoster(ctx: CanvasRenderingContext2D, data: BarcodeData, w: number, h: number) {
  const M = 180;
  const inner = w - M * 2;
  const n = data.stripes.length;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1b1a18';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 110px ${FONT}`;
  ctx.fillText('The Collection', M, 300);
  ctx.fillStyle = '#6b6862';
  ctx.font = `400 48px ${FONT}`;
  ctx.fillText(`${n.toLocaleString('en-GB')} games · ${data.first}–${data.last} · one stripe each, in the order they came home`, M, 372);

  const top = 480;
  const barH = 1000;
  paintStripes(ctx, data, M, top, inner, barH);

  // Year axis.
  ctx.fillStyle = '#1b1a18';
  ctx.font = `500 44px ${FONT}`;
  for (const mark of data.years) {
    const x = M + (mark.index / n) * inner;
    ctx.fillRect(x, top + barH, 3, 26);
    ctx.fillText(mark.year, x + 12, top + barH + 70);
  }

  // Legend: platforms in four columns, biggest first.
  const cols = 4;
  const rows = Math.ceil(data.platforms.length / cols);
  const colW = inner / cols;
  ctx.font = `400 40px ${FONT}`;
  data.platforms.forEach((p, i) => {
    const x = M + Math.floor(i / rows) * colW;
    const y = top + barH + 200 + (i % rows) * 72;
    ctx.fillStyle = stripeColour(p.platform);
    ctx.fillRect(x, y, 36, 36);
    ctx.fillStyle = '#1b1a18';
    ctx.fillText(p.platform, x + 56, y + 32);
    ctx.fillStyle = '#6b6862';
    ctx.fillText(String(p.count), x + colW - 140, y + 32);
  });

  ctx.fillStyle = '#6b6862';
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText('collection.stevan.co.rs', M, h - 90);
}

export default function Barcode({ games, bind, onOpen, onShowGames }: Props) {
  const data = useMemo(() => buildBarcode(games), [games]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const n = data.stripes.length;

  const paint = useCallback(() => {
    const el = canvas.current;
    if (!el || !el.clientWidth) return;
    const w = el.clientWidth;
    const dpr = devicePixelRatio || 1;
    el.width = Math.round(w * dpr);
    el.height = Math.round(HEIGHT * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, HEIGHT);
    paintStripes(ctx, data, 0, 0, w, HEIGHT);
    if (hover !== null) {
      // A marker, because a hovered stripe is a pixel wide and lightening it would show nothing.
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(Math.floor((hover * w) / n), 0, 2, HEIGHT);
    }
  }, [data, hover, n]);

  useEffect(() => {
    paint();
  }, [paint, width]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indexAt = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };

  const lines = (i: number) => {
    const s = data.stripes[i];
    return [s.game.title, s.game.platform, formatDate(s.game.acquired), `#${i + 1} of ${n}`];
  };

  const save = async () => {
    const w = 3600;
    const h = 480 + 1000 + 200 + Math.ceil(data.platforms.length / 4) * 72 + 300;
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    await document.fonts.ready;
    paintPoster(ctx, data, w, h);
    const blob = await new Promise<Blob | null>((r) => el.toBlob(r, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collection-barcode-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Only the years with room for a label; the rest keep their tick.
  const labelled = new Set<number>();
  let lastX = -Infinity;
  for (const mark of data.years) {
    const x = (mark.index / n) * width;
    if (x - lastX >= LABEL_GAP) {
      labelled.add(mark.index);
      lastX = x;
    }
  }

  return (
    <section className="sv-card sv-wide">
      <div className="bc-head">
        <h2 className="section-title">The barcode</h2>
        <button className="btn" onClick={save}>
          Download poster
        </button>
      </div>
      <canvas
        ref={canvas}
        className="bc-canvas"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`The collection as a barcode: ${n} games, one stripe each, oldest first, from ${data.first} to ${data.last}, coloured by platform.`}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const i = indexAt(e);
          setHover(i);
          bind(lines(i)).onPointerMove(e);
        }}
        onPointerLeave={() => {
          setHover(null);
          bind([]).onPointerLeave();
        }}
        onClick={(e) => onOpen(data.stripes[indexAt(e)].game)}
      />
      <div className="bc-axis">
        {data.years.map((mark) => (
          <span key={mark.year} className="bc-year" style={{ left: `${(mark.index / n) * 100}%` }}>
            {labelled.has(mark.index) ? mark.year : ''}
          </span>
        ))}
      </div>
      <ul className="bc-legend">
        {data.platforms.map((p) => (
          <li key={p.platform}>
            <button className="bc-key" onClick={() => onShowGames({ platforms: [p.platform] })} {...bind([p.platform, `${p.count} games`])}>
              <span className="bc-swatch" style={{ background: stripeColour(p.platform) }} />
              {p.platform} <span className="muted">{p.count}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="sv-note muted">
        One stripe per game, oldest first, coloured by platform. Click a stripe to open the game, a platform to see its games.
        {data.undated ? ` ${data.undated} games with no date at all aren't here.` : ''}
      </p>
    </section>
  );
}
