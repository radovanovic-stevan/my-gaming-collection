import { useMemo, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import world from 'world-atlas/countries-50m.json';
import type { Game } from '../types';
import { Cover } from './Cover';
import { PlatformBadge } from './Badges';

interface Props {
  games: Game[];
  onOpen: (game: Game) => void;
}

const WIDTH = 960;
const HEIGHT = 470;

type Country = Feature<Geometry, { name: string }>;

// Country shapes, projected once. Antarctica only takes up room.
const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const countries = (feature(topology, topology.objects.countries).features as Country[]).filter((f) => f.properties.name !== 'Antarctica');
const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features: countries });
const path = geoPath(projection);
const shapes = countries.map((f) => ({ name: f.properties.name, d: path(f) ?? '' }));

/** The default view: Europe, from Iceland and Portugal across to the Urals' foothills. */
const EUROPE = (() => {
  const box = path.bounds({ type: 'Polygon', coordinates: [[[-25, 34], [-25, 71], [45, 71], [45, 34], [-25, 34]]] });
  const [[x0, y0], [x1, y1]] = box;
  // Keep the map's aspect ratio so countries aren't stretched.
  const h = y1 - y0;
  const w = Math.max(x1 - x0, h * (WIDTH / HEIGHT));
  return `${(x0 + x1) / 2 - w / 2} ${y0} ${w} ${w * (HEIGHT / WIDTH)}`;
})();
const WORLD = `0 0 ${WIDTH} ${HEIGHT}`;

const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title) || a.platform.localeCompare(b.platform);

export default function MapView({ games, onOpen }: Props) {
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [wholeWorld, setWholeWorld] = useState(false);

  const byCountry = useMemo(() => {
    const m = new Map<string, Game[]>();
    for (const g of games) if (g.boughtIn) m.set(g.boughtIn, [...(m.get(g.boughtIn) ?? []), g]);
    return m;
  }, [games]);
  const ranked = [...byCountry].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...ranked.map(([, gs]) => gs.length));
  const unknown = games.length - ranked.reduce((s, [, gs]) => s + gs.length, 0);
  const onMap = new Set(shapes.map((s) => s.name));
  const viewBox = wholeWorld ? WORLD : EUROPE;
  // Keep borders a steady width however far the map is zoomed in.
  const scale = WIDTH / Number(viewBox.split(' ')[2]);

  // More games, stronger colour; every country with a game stays clearly visible.
  const fill = (n: number) => (n ? `color-mix(in srgb, var(--accent) ${Math.round(35 + 65 * Math.sqrt(n / max))}%, var(--bg-elev))` : undefined);
  const list = selected ? [...(byCountry.get(selected) ?? [])].sort(byTitle) : [];
  const hovered = hover ? (byCountry.get(hover.name)?.length ?? 0) : 0;

  return (
    <section className="awards">
      <div className="awards-head">
        <div>
          <h2>Map</h2>
          <p className="muted">Where the games were bought. Hover a country for its count, click it for the list.</p>
        </div>
        <div className="awards-actions">
          <button className="btn" onClick={() => setWholeWorld(!wholeWorld)}>
            {wholeWorld ? 'Zoom to Europe' : 'Show the whole world'}
          </button>
        </div>
      </div>

      <div className="world-map" onMouseLeave={() => setHover(null)}>
        <svg viewBox={viewBox} style={{ '--map-scale': scale } as React.CSSProperties} role="img" aria-label="World map of where games were bought">
          {shapes.map((s) => {
            const n = byCountry.get(s.name)?.length ?? 0;
            return (
              <path
                key={s.name}
                d={s.d}
                className={`country ${n ? 'has-games' : ''} ${s.name === selected ? 'selected' : ''}`}
                style={{ fill: fill(n) }}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect();
                  setHover({ name: s.name, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onClick={() => n && setSelected(s.name === selected ? null : s.name)}
              />
            );
          })}
        </svg>
        {hover && (
          <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}>
            <b>{hover.name}</b>
            <span>{hovered ? `${hovered} game${hovered === 1 ? '' : 's'}` : 'No games'}</span>
          </div>
        )}
      </div>

      <div className="chips map-countries" role="group" aria-label="Countries">
        {ranked.map(([name, gs]) => (
          <button key={name} className={`chip ${name === selected ? 'on' : ''}`} aria-pressed={name === selected} onClick={() => setSelected(name === selected ? null : name)}>
            {name} <span className="chip-count">{gs.length}</span>
            {!onMap.has(name) && <span className="muted"> (not on map)</span>}
          </button>
        ))}
        {unknown > 0 && <span className="muted small">{unknown} games without a country yet</span>}
      </div>

      {selected && (
        <div className="award-group">
          <h3 className="section-title">
            Bought in {selected} · {list.length}
          </h3>
          <ul className="map-games">
            {list.map((g) => (
              <li key={g.id}>
                <button className="map-game" onClick={() => onOpen(g)}>
                  <span className="rank-thumb">
                    <Cover game={g} />
                  </span>
                  <span className="ref-title">{g.title}</span> <PlatformBadge platform={g.platform} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
