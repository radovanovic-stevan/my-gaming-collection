import { useMemo, useState } from 'react';
import type { Game, ShrineCatalogue } from '../types';
import { buildShrine, type ShrineGame, type ShrineSeries } from '../lib/shrine';
import { platformHue } from '../lib/format';
import { Cover } from './Cover';

interface Props {
  catalogue: ShrineCatalogue;
  games: Game[];
  onOpen: (game: Game) => void;
}

type Show = 'all' | 'owned' | 'missing';

/** One game: its cover when it's on the shelf, an empty niche when it isn't. */
function Tile({ game, mark, onOpen }: { game: ShrineGame; mark?: string; onOpen: (game: Game) => void }) {
  const { entry, copies, extra, done } = game;
  const owned = copies.length > 0;
  const platforms = [...entry.platforms, ...extra];
  const copyOn = new Map(copies.map((c) => [c.platform, c]));
  const title = [entry.title, entry.note, entry.jp ? 'Japan only' : null, `On ${platforms.join(', ')}`].filter(Boolean).join(' — ');
  // Three platforms fit under a tile; the rest are a count, and the tooltip has them all.
  const shown = platforms.slice(0, 3);

  return (
    <li className={`shr-tile ${owned ? 'owned' : 'missing'} ${done ? 'done' : ''}`}>
      {owned ? (
        <button className="shr-frame" onClick={() => onOpen(copies[0])} title={`${title} — open in the collection`}>
          <Cover game={copies[0]} />
          <span className="shr-shade" aria-hidden="true" />
          {done && (
            <span className="shr-crest" title="Finished">
              ★
            </span>
          )}
          {copies.length > 1 && <span className="shr-dupe">×{copies.length}</span>}
        </button>
      ) : (
        <div className="shr-frame" title={title}>
          <span className={mark ? 'shr-niche-mark' : 'shr-niche-year'} aria-hidden="true">
            {mark ?? entry.year}
          </span>
        </div>
      )}
      <div className="shr-cap">
        <span className="shr-cap-title">
          {entry.title}
          {entry.jp && <span className="shr-jp" title="Never released outside Japan">JP</span>}
        </span>
        <span className="shr-cap-meta">
          <span className="shr-year">{entry.year}</span>
          {owned ? (
            <span className="shr-plats">
              {platforms
                .filter((p) => copyOn.has(p))
                .map((p) => (
                  <button
                    key={p}
                    className="shr-plat"
                    style={{ '--hue': platformHue(p) } as React.CSSProperties}
                    onClick={() => onOpen(copyOn.get(p)!)}
                    title={`${copyOn.get(p)!.title} (${p}) — open in the collection`}
                  >
                    {p}
                  </button>
                ))}
            </span>
          ) : (
            <span className="shr-on">
              {shown.join(' · ')}
              {platforms.length > shown.length && <i>+{platforms.length - shown.length}</i>}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function Banner({ series, show, mark, onOpen }: { series: ShrineSeries; show: Show; mark?: string; onOpen: (game: Game) => void }) {
  const games = series.games.filter((g) => show === 'all' || (g.copies.length > 0) === (show === 'owned'));
  if (!games.length) return null;
  const pct = series.total ? (series.owned / series.total) * 100 : 0;
  const full = series.owned === series.total;
  return (
    <section className={`shr-series ${full ? 'full' : ''}`} id={`shrine-${series.id}`}>
      <header className="shr-banner">
        {series.kanji && (
          <span className="shr-banner-kanji" aria-hidden="true">
            {series.kanji}
          </span>
        )}
        <h3>{series.name}</h3>
        {series.note && <span className="shr-banner-note">{series.note}</span>}
        {full && <span className="shr-complete">complete</span>}
        <span className="shr-banner-count">
          <b>{series.owned}</b>/{series.total}
        </span>
        <span className="shr-meter" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${series.name} owned`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      </header>
      <ul className="shr-wall">
        {games.map((g) => (
          <Tile key={`${g.entry.title}-${g.entry.year}`} game={g} mark={mark} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/** A catalogue as a wall: covers for the games that are here, empty niches for the rest. */
export default function ShrineView({ catalogue, games, onOpen }: Props) {
  const data = useMemo(() => buildShrine(catalogue, games), [catalogue, games]);
  const [show, setShow] = useState<Show>('all');
  const pct = Math.round((data.owned / data.total) * 100);
  // The series the collection has the most of, as a share of it.
  const best = data.series.reduce((a, b) => (b.owned / b.total > a.owned / a.total ? b : a));

  return (
    <section className="shrine-page">
      <div className={`shr-shrine ${catalogue.theme === 'marble' ? 'shr-marble' : ''}`}>
        <header className="shr-hero">
          {catalogue.kanji && (
            <span className="shr-hero-kanji" aria-hidden="true">
              {catalogue.kanji}
            </span>
          )}
          <p className="shr-eyebrow">{catalogue.eyebrow ?? `${catalogue.series.length} series`}</p>
          <h2>{catalogue.title}</h2>
          <p className="shr-hero-note">{catalogue.note}</p>

          <div className="shr-tally">
            <span className="shr-tally-big">
              <b>{data.owned}</b>
              <i>/ {data.total}</i>
            </span>
            <span className="shr-meter big" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Owned">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="shr-tally-pct">{pct}%</span>
          </div>

          <ul className="shr-facts">
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
              {data.complete > 0 ? (
                <>
                  <b>{data.complete}</b> {data.complete === 1 ? 'series' : 'series'} complete
                </>
              ) : (
                <>
                  Best run <b>{best.name}</b>, {best.owned} of {best.total}
                </>
              )}
            </li>
          </ul>

          {/* With more than a few series, the hero doubles as the way in to each one. */}
          {data.series.length > 3 && (
            <nav className="shr-jump" aria-label="Series">
              {data.series.map((s) => (
                <a key={s.id} href={`#shrine-${s.id}`} className={s.owned === s.total ? 'full' : ''}>
                  <span className="shr-jump-name">{s.name}</span>
                  <span className="shr-jump-count">
                    {s.owned}/{s.total}
                  </span>
                  <span className="shr-jump-meter">
                    <span style={{ width: `${(s.owned / s.total) * 100}%` }} />
                  </span>
                </a>
              ))}
            </nav>
          )}

          <div className="shr-switch" role="group" aria-label="Show">
            {(['all', 'owned', 'missing'] as const).map((s) => (
              <button key={s} className={show === s ? 'on' : ''} aria-pressed={show === s} onClick={() => setShow(s)}>
                {s === 'all' ? 'Everything' : s === 'owned' ? 'On the shelf' : 'Missing'}
              </button>
            ))}
          </div>
        </header>

        {data.series.map((s) => (
          <Banner key={s.id} series={s} show={show} mark={catalogue.mark} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
