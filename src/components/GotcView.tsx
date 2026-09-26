import { useState } from 'react';
import type { AwardValue, Game, GameRef, GotcData, GotcYear } from '../types';
import { isGameRef } from '../lib/links';
import { RefCover, RefTitle } from './GameRefView';

interface Props {
  data: GotcData;
  link: (ref: GameRef) => Game | null;
  onOpen: (game: Game) => void;
}

type Group = { title: string; test: (category: string) => boolean };

const PLATFORM_WORDS = /^(PS1|PS Classic|PS2|PS3|PS4|Wii|3DS|DS|GCN|SNES Classic|PSP|VITA|Atari FB|PC)\b/;

// Yearly categories, in display order. The top three GOTY places get a podium instead.
const PODIUM = ['Game of the Year Winner', 'Game of the Year Runner-Up', 'Game of the Year Third Place'];
const YEAR_GROUPS: Group[] = [
  { title: 'Quarters', test: (c) => /^Best Game of Q\d/.test(c) },
  { title: 'Platforms', test: (c) => PLATFORM_WORDS.test(c) && c.endsWith('GOTY') },
  { title: 'Genres', test: (c) => c.endsWith('GOTY') && !PLATFORM_WORDS.test(c) && !c.startsWith('Games from') && !c.startsWith('Co-op') },
  { title: 'Highlights', test: () => true },
];

const ALL_TIME_GROUPS: Group[] = [
  { title: 'Overall', test: (c) => c === 'All-Time List' || c.startsWith('Games from') },
  { title: 'By year', test: (c) => /^Games (Acquired|Completed) \d{4}$/.test(c) },
  { title: 'Platforms', test: (c) => PLATFORM_WORDS.test(c) },
  { title: 'Genres', test: () => true },
];

/** Puts each item into the first group whose test it passes. */
function groupBy<T>(items: T[], groups: Group[], category: (item: T) => string) {
  const out = groups.map((g) => ({ title: g.title, items: [] as T[] }));
  for (const item of items) out[groups.findIndex((g) => g.test(category(item)))].items.push(item);
  return out.filter((g) => g.items.length);
}

function Award({ value, link, onOpen, size = 'small' }: { value: AwardValue | null; link: Props['link']; onOpen: Props['onOpen']; size?: 'small' | 'large' }) {
  if (!value) return <span className="muted">No winner</span>;
  if (!isGameRef(value)) return <span className="award-text">{value.text}</span>;
  const game = link(value);
  return (
    <div className={`award-game award-${size}`}>
      <button className="award-cover" onClick={() => game && onOpen(game)} disabled={!game} aria-label={value.title}>
        <RefCover entry={value} game={game} />
      </button>
      <RefTitle entry={value} game={game} onOpen={onOpen} />
    </div>
  );
}

function YearStats({ year, link, onOpen }: { year: GotcYear; link: Props['link']; onOpen: Props['onOpen'] }) {
  const s = year.stats;
  return (
    <aside className="year-stats">
      <div className="year-totals">
        {s.gamesCompleted !== undefined && (
          <div>
            <b>{s.gamesCompleted}</b>
            <span>completed</span>
          </div>
        )}
        {s.gamesBought !== undefined && (
          <div>
            <b>{s.gamesBought}</b>
            <span>bought</span>
          </div>
        )}
      </div>
      {s.consolesBought?.length ? (
        <div className="stat-block">
          <h4>Consoles bought</h4>
          <div className="chips">
            {s.consolesBought.map((c) => (
              <span key={c} className="chip static">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {s.multipleGotmWinners?.length ? (
        <div className="stat-block">
          <h4>Game of the Month more than once</h4>
          <ul className="plain-list">
            {s.multipleGotmWinners.map((g) => (
              <li key={g.title}>
                <RefTitle entry={g} game={link(g)} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.ratingChanges?.length ? (
        <div className="stat-block">
          <h4>Rating changes</h4>
          <ul className="plain-list">
            {s.ratingChanges.map((r) => (
              <li key={r.title}>
                {r.title}{' '}
                <span className="muted">
                  {r.from} → <b className={r.to < r.from ? 'down' : 'up'}>{r.to}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.honorableMentions && (
        <div className="stat-block">
          <h4>Moment of the Year: honourable mentions</h4>
          <p className="small">{s.honorableMentions}</p>
        </div>
      )}
    </aside>
  );
}

export function GotcView({ data, link, onOpen }: Props) {
  const [mode, setMode] = useState<'yearly' | 'all-time'>('yearly');
  const [yearNo, setYearNo] = useState(data.years[0]?.year);
  const year = data.years.find((y) => y.year === yearNo) ?? data.years[0];

  const podium = PODIUM.map((c) => year.awards.find((a) => a.category === c));
  const rest = year.awards.filter((a) => !PODIUM.includes(a.category));

  return (
    <section className="awards">
      <div className="awards-head">
        <div>
          <h2>Game of the Category</h2>
          <p className="muted" title={data.about}>
            Favourite games per year and per category.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button className={mode === 'yearly' ? 'on' : ''} onClick={() => setMode('yearly')}>
            Yearly awards
          </button>
          <button className={mode === 'all-time' ? 'on' : ''} onClick={() => setMode('all-time')}>
            All-time top 5
          </button>
        </div>
      </div>

      {mode === 'yearly' ? (
        <>
          <div className="year-picker" role="group" aria-label="Year">
            {data.years.map((y) => (
              <button key={y.year} className={`chip ${y.year === year.year ? 'on' : ''}`} aria-pressed={y.year === year.year} onClick={() => setYearNo(y.year)}>
                {y.year}
              </button>
            ))}
          </div>

          <div className="gotc-year">
            <div>
              <h3 className="section-title">Game of the Year {year.year}</h3>
              <ol className="podium">
                {podium.map((a, i) =>
                  a ? (
                    <li key={a.category} className={`podium-${i + 1}`}>
                      <span className="podium-place">{['🥇 Winner', '🥈 Runner-up', '🥉 Third place'][i]}</span>
                      <Award value={a.winner} link={link} onOpen={onOpen} size="large" />
                    </li>
                  ) : null,
                )}
              </ol>

              {groupBy(rest, YEAR_GROUPS, (a) => a.category).map((group) => (
                <div key={group.title} className="award-group">
                  <h3 className="section-title">{group.title}</h3>
                  <ul className="award-grid">
                    {group.items.map((a) => (
                      <li key={a.category} className="award-card">
                        <span className="award-category">{a.category}</span>
                        <Award value={a.winner} link={link} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <YearStats year={year} link={link} onOpen={onOpen} />
          </div>
        </>
      ) : (
        groupBy(data.allTime, ALL_TIME_GROUPS, (c) => c.category).map((group) => (
          <div key={group.title} className="award-group">
            <h3 className="section-title">{group.title}</h3>
            <ul className="ranking-grid">
              {group.items.map((c) => (
                <li key={c.category} className="ranking-card">
                  <h4>{c.category}</h4>
                  <ol>
                    {c.ranking.map((v, i) => (
                      <li key={i}>
                        <span className="rank">{i + 1}</span>
                        {isGameRef(v) ? (
                          <>
                            <span className="rank-thumb">
                              <RefCover entry={v} game={link(v)} />
                            </span>
                            <RefTitle entry={v} game={link(v)} onOpen={onOpen} />
                          </>
                        ) : (
                          <span className="award-text">{v.text}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <p className="about muted small">{data.about}</p>
    </section>
  );
}
