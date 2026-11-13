import { useMemo, useState } from 'react';
import type { Game, WarriorsCatalogue } from '../types';
import { buildWarriors, type WarriorsGame, type WarriorsSeries } from '../lib/warriors';
import { platformHue } from '../lib/format';
import { Cover } from './Cover';

interface Props {
  catalogue: WarriorsCatalogue;
  games: Game[];
  onOpen: (game: Game) => void;
}

type Show = 'all' | 'owned' | 'missing';

/** One game: its cover when it's on the shelf, an empty niche when it isn't. */
function Tile({ game, onOpen }: { game: WarriorsGame; onOpen: (game: Game) => void }) {
  const { entry, copies, extra, done } = game;
  const owned = copies.length > 0;
  const platforms = [...entry.platforms, ...extra];
  const copyOn = new Map(copies.map((c) => [c.platform, c]));
  const title = [entry.title, entry.note, entry.jp ? 'Japan only' : null, `On ${platforms.join(', ')}`].filter(Boolean).join(' — ');
  // Three platforms fit under a tile; the rest are a count, and the tooltip has them all.
  const shown = platforms.slice(0, 3);

  return (
    <li className={`wr-tile ${owned ? 'owned' : 'missing'} ${done ? 'done' : ''}`}>
      {owned ? (
        <button className="wr-frame" onClick={() => onOpen(copies[0])} title={`${title} — open in the collection`}>
          <Cover game={copies[0]} />
          <span className="wr-shade" aria-hidden="true" />
          {done && (
            <span className="wr-crest" title="Finished">
              ★
            </span>
          )}
          {copies.length > 1 && <span className="wr-dupe">×{copies.length}</span>}
        </button>
      ) : (
        <div className="wr-frame" title={title}>
          <span className="wr-niche-mark" aria-hidden="true">
            無
          </span>
        </div>
      )}
      <div className="wr-cap">
        <span className="wr-cap-title">
          {entry.title}
          {entry.jp && <span className="wr-jp" title="Never released outside Japan">JP</span>}
        </span>
        <span className="wr-cap-meta">
          <span className="wr-year">{entry.year}</span>
          {owned ? (
            <span className="wr-plats">
              {platforms
                .filter((p) => copyOn.has(p))
                .map((p) => (
                  <button
                    key={p}
                    className="wr-plat"
                    style={{ '--hue': platformHue(p) } as React.CSSProperties}
                    onClick={() => onOpen(copyOn.get(p)!)}
                    title={`${copyOn.get(p)!.title} (${p}) — open in the collection`}
                  >
                    {p}
                  </button>
                ))}
            </span>
          ) : (
            <span className="wr-on">
              {shown.join(' · ')}
              {platforms.length > shown.length && <i>+{platforms.length - shown.length}</i>}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function Banner({ series, show, onOpen }: { series: WarriorsSeries; show: Show; onOpen: (game: Game) => void }) {
  const games = series.games.filter((g) => show === 'all' || (g.copies.length > 0) === (show === 'owned'));
  if (!games.length) return null;
  const pct = series.total ? (series.owned / series.total) * 100 : 0;
  return (
    <section className="wr-series">
      <header className="wr-banner">
        <span className="wr-banner-kanji" aria-hidden="true">
          {series.kanji}
        </span>
        <h3>{series.name}</h3>
        {series.note && <span className="wr-banner-note">{series.note}</span>}
        <span className="wr-banner-count">
          <b>{series.owned}</b>/{series.total}
        </span>
        <span className="wr-meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${series.name} owned`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      </header>
      <ul className="wr-wall">
        {games.map((g) => (
          <Tile key={`${g.entry.title}-${g.entry.year}`} game={g} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/** Every Musou game Omega Force has made, as a wall: covers for the ones here, empty niches for the rest. */
export default function WarriorsView({ catalogue, games, onOpen }: Props) {
  const data = useMemo(() => buildWarriors(catalogue, games), [catalogue, games]);
  const [show, setShow] = useState<Show>('all');
  const pct = Math.round((data.owned / data.total) * 100);
  // The series the collection has the most of, as a share of it.
  const best = data.series.reduce((a, b) => (b.owned / b.total > a.owned / a.total ? b : a));

  return (
    <section className="warriors">
      <div className="wr-shrine">
        <header className="wr-hero">
          <span className="wr-hero-kanji" aria-hidden="true">
            {catalogue.kanji}
          </span>
          <p className="wr-eyebrow">Omega Force · Koei Tecmo</p>
          <h2>{catalogue.title}</h2>
          <p className="wr-hero-note">{catalogue.note}</p>

          <div className="wr-tally">
            <span className="wr-tally-big">
              <b>{data.owned}</b>
              <i>/ {data.total}</i>
            </span>
            <span className="wr-meter big" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Owned">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="wr-tally-pct">{pct}%</span>
          </div>

          <ul className="wr-facts">
            <li>
              <b>{data.copies}</b> copies on the shelf
            </li>
            <li>
              <b>{data.done}</b> finished
            </li>
            <li>
              <b>{data.total - data.owned}</b> still out there
            </li>
            <li>
              Best run <b>{best.name}</b>, {best.owned} of {best.total}
            </li>
          </ul>

          <div className="wr-switch" role="group" aria-label="Show">
            {(['all', 'owned', 'missing'] as const).map((s) => (
              <button key={s} className={show === s ? 'on' : ''} aria-pressed={show === s} onClick={() => setShow(s)}>
                {s === 'all' ? 'Everything' : s === 'owned' ? 'On the shelf' : 'Missing'}
              </button>
            ))}
          </div>
        </header>

        {data.series.map((s) => (
          <Banner key={s.id} series={s} show={show} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
