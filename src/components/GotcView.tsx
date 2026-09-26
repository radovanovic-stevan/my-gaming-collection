import { useState } from 'react';
import type { AwardValue, Game, GameRef, GotcData, GotcYear, GotmMonth } from '../types';
import { isGameRef } from '../lib/links';
import { RefCover, RefTitle } from './GameRefView';
import { YearEditor } from './YearEditor';
import { RankingEditor } from './RankingEditor';

interface Props {
  data: GotcData;
  link: (ref: GameRef) => Game | null;
  onOpen: (game: Game) => void;
  /** Local editing (dev server only). */
  editable: boolean;
  games: Game[];
  /** Game of the Month data, used to fill in a year's stats while editing. */
  months: GotmMonth[] | null;
  onChange: (data: GotcData) => void;
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

export function GotcView({ data, link, onOpen, editable, games, months, onChange }: Props) {
  const [mode, setMode] = useState<'yearly' | 'all-time'>('yearly');
  const [yearNo, setYearNo] = useState<number | undefined>(data.years[0]?.year);
  const year: GotcYear | undefined = data.years.find((y) => y.year === yearNo) ?? data.years[0];
  // undefined: closed; null: adding; otherwise what's being edited.
  const [editingYear, setEditingYear] = useState<GotcYear | null | undefined>(undefined);
  const [editingRanking, setEditingRanking] = useState<number | null | undefined>(undefined);

  const podium = year ? PODIUM.map((c) => year.awards.find((a) => a.category === c)) : [];
  const rest = year ? year.awards.filter((a) => !PODIUM.includes(a.category)) : [];

  const onYearSaved = (saved: GotcYear, previousKey: number | null) => {
    const others = data.years.filter((y) => y.year !== saved.year && y.year !== previousKey);
    onChange({ ...data, years: [...others, saved].sort((a, b) => b.year - a.year) });
    setYearNo(saved.year);
    setEditingYear(undefined);
  };
  const onYearDeleted = (key: number) => {
    onChange({ ...data, years: data.years.filter((y) => y.year !== key) });
    setYearNo(undefined);
    setEditingYear(undefined);
  };

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
          <div className="awards-actions">
            <div className="year-picker" role="group" aria-label="Year">
              {data.years.map((y) => (
                <button key={y.year} className={`chip ${y.year === year?.year ? 'on' : ''}`} aria-pressed={y.year === year?.year} onClick={() => setYearNo(y.year)}>
                  {y.year}
                </button>
              ))}
            </div>
            {editable && (
              <div className="detail-nav">
                {year && (
                  <button className="btn" onClick={() => setEditingYear(year)}>
                    Edit {year.year}
                  </button>
                )}
                <button className="btn primary" onClick={() => setEditingYear(null)}>
                  + Add year
                </button>
              </div>
            )}
          </div>

          {!year ? (
            <div className="empty">No years yet.</div>
          ) : (
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
          )}
        </>
      ) : (
        <>
          {editable && (
            <div className="awards-actions">
              <span className="muted small">Each ranking is a top 5.</span>
              <button className="btn primary" onClick={() => setEditingRanking(null)}>
                + Add ranking
              </button>
            </div>
          )}
          {groupBy(
            data.allTime.map((c, index) => ({ ...c, index })),
            ALL_TIME_GROUPS,
            (c) => c.category,
          ).map((group) => (
            <div key={group.title} className="award-group">
              <h3 className="section-title">{group.title}</h3>
              <ul className="ranking-grid">
                {group.items.map((c) => (
                  <li key={c.category} className="ranking-card">
                    <div className="ranking-head">
                      <h4>{c.category}</h4>
                      {editable && (
                        <button className="link" onClick={() => setEditingRanking(c.index)}>
                          Edit
                        </button>
                      )}
                    </div>
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
          ))}
        </>
      )}

      <p className="about muted small">{data.about}</p>

      {editingYear !== undefined && (
        <YearEditor
          year={editingYear}
          years={data.years}
          months={months}
          games={games}
          link={link}
          onSaved={onYearSaved}
          onDeleted={onYearDeleted}
          onClose={() => setEditingYear(undefined)}
        />
      )}
      {editingRanking !== undefined && (
        <RankingEditor
          allTime={data.allTime}
          index={editingRanking}
          games={games}
          link={link}
          onSaved={(allTime) => (onChange({ ...data, allTime }), setEditingRanking(undefined))}
          onClose={() => setEditingRanking(undefined)}
        />
      )}
    </section>
  );
}
