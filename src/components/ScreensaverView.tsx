import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, GotmMonth, PlayStatus } from '../types';
import { band } from '../lib/bands';
import { coverUrl } from '../lib/format';
import { createProgramme, segmentCaption, segmentImages, type Segment } from '../lib/screensaver';

interface Props {
  games: Game[];
  months: GotmMonth[];
  link: (ref: { title: string; platform: string } | null) => Game | null;
}

/** How long a new segment takes to cover the one before it; the old one is dropped once it's hidden. */
const FADE = 1100;
/** How long the controls stay up after the last sign of life. */
const IDLE = 2800;

type Layer = { seg: Segment; key: number };

const PLAYED_WORD: Record<PlayStatus, string> = {
  completed: 'finished',
  'in-progress': 'in progress',
  played: 'played',
  'post-completion': 'revisited',
};

const preload = (urls: string[]) => {
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
};

export default function ScreensaverView({ games, months, link }: Props) {
  const programme = useMemo(() => createProgramme(games, months, link), [games, months, link]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [full, setFull] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [nudge, setNudge] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const stage = useRef<HTMLDivElement>(null);
  /** The segment after the one on screen, built early so its pictures are fetched while this one plays. */
  const upcoming = useRef<Segment | null>(null);
  const keyAt = useRef(0);

  /** Timers that drop a covered layer, cleared on the way out so nothing is set after unmounting. */
  const drops = useRef<number[]>([]);
  useEffect(() => () => drops.current.forEach(window.clearTimeout), []);

  const advance = useCallback(() => {
    const seg = upcoming.current ?? programme.next();
    upcoming.current = programme.next();
    preload(segmentImages(upcoming.current));
    const key = (keyAt.current += 1);
    setLayers((ls) => [...ls, { seg, key }]);
    drops.current = [...drops.current.slice(-4), window.setTimeout(() => setLayers((ls) => ls.filter((l) => l.key >= key)), FADE)];
  }, [programme]);

  // The channel starts on its own: opening the tab is the only input it needs.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    advance();
  }, [advance]);

  const current = layers[layers.length - 1]?.seg ?? null;
  const running = !paused && !hidden;
  useEffect(() => {
    if (!current || !running) return;
    const t = window.setTimeout(advance, current.seconds * 1000);
    return () => window.clearTimeout(t);
  }, [current, running, advance]);

  // Nothing plays to an unwatched tab.
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onFull = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  // Full screen on a television shouldn't be interrupted by the television.
  useEffect(() => {
    if (!full || !running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dropped = false;
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (dropped) void l.release();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      dropped = true;
      lock?.release().catch(() => undefined);
    };
  }, [full, running]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 20000);
    return () => window.clearInterval(t);
  }, []);

  // The controls show themselves at any sign of life and withdraw again once it stops.
  useEffect(() => {
    setChrome(true);
    const t = window.setTimeout(() => setChrome(false), IDLE);
    return () => window.clearTimeout(t);
  }, [nudge]);

  const lastWake = useRef(0);
  const wake = useCallback(() => {
    const now = Date.now();
    if (now - lastWake.current < 300) return;
    lastWake.current = now;
    setNudge((n) => n + 1);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      wake();
      if (e.key === ' ') (e.preventDefault(), setPaused((p) => !p));
      else if (e.key === 'ArrowRight' || e.key === 'n') advance();
      else if (e.key === 'f') toggleFull();
    },
    [advance, toggleFull, wake],
  );

  return (
    <div
      className={`ss-stage${full ? ' full' : ''}`}
      ref={stage}
      tabIndex={0}
      onPointerMove={wake}
      onPointerDown={wake}
      onKeyDown={onKey}
      aria-label="Screensaver"
    >
      {layers.map((l) => (
        <div className="ss-layer" key={l.key} style={{ animationDuration: `${FADE}ms` }}>
          <SegmentView seg={l.seg} />
        </div>
      ))}

      <div className="ss-mark">
        <span className="ss-mark-dot" aria-hidden="true" />
        {current ? segmentCaption(current) : 'Tuning in'}
      </div>
      <div className="ss-clock">{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>

      <div className={`ss-controls${chrome ? ' on' : ''}`}>
        <button className="ss-btn" onClick={() => setPaused((p) => !p)}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button className="ss-btn" onClick={advance}>
          Next
        </button>
        <button className="ss-btn" onClick={toggleFull}>
          {full ? 'Exit' : 'Full screen'}
        </button>
      </div>
    </div>
  );
}

function SegmentView({ seg }: { seg: Segment }) {
  switch (seg.kind) {
    case 'ident': {
      const [bandColor, labelColor, label] = band(seg.platform);
      return (
        <div className="ss-ident" style={{ '--band': bandColor, '--band-fg': labelColor } as React.CSSProperties}>
          <div className="ss-ident-strip" aria-hidden="true">
            {seg.covers.map((g) => (
              <img key={g.id} src={coverUrl(g)!} alt="" />
            ))}
          </div>
          <div className="ss-ident-mark">
            <span className="ss-ident-label">{label}</span>
            <div className="ss-ident-text">
              <strong>{seg.platform}</strong>
              <span>{seg.count} games</span>
            </div>
          </div>
        </div>
      );
    }
    case 'closeup': {
      const url = coverUrl(seg.game)!;
      return (
        <div className="ss-closeup">
          <div className="ss-backdrop" style={{ backgroundImage: `url(${url})` }} aria-hidden="true" />
          <div className="ss-closeup-art">
            <img src={url} alt="" />
          </div>
          <div className="ss-closeup-text">
            <span className="ss-eyebrow">{seg.game.platform}</span>
            <h2>{seg.game.title}</h2>
            {seg.lines.length > 0 && <p>{seg.lines.join(' · ')}</p>}
          </div>
          {seg.game.rating !== null && <div className="ss-score">{seg.game.rating}</div>}
        </div>
      );
    }
    case 'drift':
      return (
        <div className="ss-drift" aria-hidden="true">
          {seg.columns.map((col, i) => (
            <div className="ss-col" key={i} style={{ animationDuration: `${26 + i * 7}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }}>
              {[...col, ...col].map((g, j) => (
                <img key={`${g.id}-${j}`} src={coverUrl(g)!} alt="" />
              ))}
            </div>
          ))}
          <div className="ss-drift-veil" />
        </div>
      );
    case 'mosaic':
      return (
        <div className="ss-mosaic">
          <div className="ss-mosaic-grid" aria-hidden="true">
            {seg.games.map((g, i) => (
              <img key={g.id} src={coverUrl(g)!} alt="" style={{ animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
          <div className="ss-fact">
            <strong>{seg.value}</strong>
            <span>{seg.caption}</span>
          </div>
        </div>
      );
    case 'marquee':
      return (
        <div className="ss-marquee">
          <div className="ss-marquee-head">
            <span className="ss-eyebrow">{seg.eyebrow}</span>
            <h2>{seg.month}</h2>
          </div>
          {seg.headline && (
            <div className="ss-marquee-star">
              <img src={coverUrl(seg.headline)!} alt="" />
              <strong>{seg.headline.title}</strong>
            </div>
          )}
          <ul className="ss-marquee-list">
            {seg.played.map((p, i) => (
              <li key={`${p.game.id}-${i}`} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                <img src={coverUrl(p.game)!} alt="" />
                <span>
                  <strong>{p.game.title}</strong>
                  <em>{p.status ? PLAYED_WORD[p.status] : p.game.platform}</em>
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}
