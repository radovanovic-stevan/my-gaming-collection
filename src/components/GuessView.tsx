import { useMemo, useState } from 'react';
import type { Game } from '../types';
import { acquiredSortKey, imageUrl } from '../lib/format';
import { PlatformBadge, RatingBadge } from './Badges';

/** Guesses before the cover is shown whole. */
const TRIES = 2;
const STORE = 'guess-the-game-stats';
/** Covers from the latest rounds, not picked again for a while. */
const RECENT = 50;
/** How blurred and how zoomed the cover is after each wrong guess. */
const STEPS = [
  { blur: 9, zoom: 2.4 },
  { blur: 7, zoom: 2 },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const yearOf = (g: Game) => acquiredSortKey(g.acquired).slice(0, 4);

type Round = { id: number; guesses: number[]; won: boolean };
type Stats = { played: number; won: number; streak: number; best: number; recent: number[] };
const NO_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0, recent: [] };

// Stats live only in this browser; without storage the game still plays, it just forgets.
function load(): Stats {
  try {
    return { ...NO_STATS, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Stats>) };
  } catch {
    return NO_STATS;
  }
}
function save(stats: Stats) {
  try {
    localStorage.setItem(STORE, JSON.stringify(stats));
  } catch {
    /* nothing to do */
  }
}

/** A random cover, skipping the ones played lately while there are others. Compilations share a cover, so go by cover, not by id. */
function pick(pool: Game[], recent: number[]): Round {
  const seen = new Set(pool.filter((g) => recent.includes(g.id)).map((g) => g.cover));
  const fresh = pool.filter((g) => !seen.has(g.cover));
  const from = fresh.length ? fresh : pool;
  return { id: from[Math.floor(Math.random() * from.length)].id, guesses: [], won: false };
}

function GuessRow({ guess, answer, right }: { guess: Game; answer: Game; right: boolean }) {
  const samePlatform = guess.platform === answer.platform;
  const gy = yearOf(guess);
  const ay = yearOf(answer);
  const year = !gy || !ay ? '?' : gy === ay ? '✓' : gy < ay ? '↑' : '↓';
  const rating = guess.rating == null || answer.rating == null ? '?' : guess.rating === answer.rating ? '✓' : guess.rating < answer.rating ? '↑' : '↓';
  return (
    <li className={`gg-row ${right ? 'gg-right' : ''}`}>
      <span className="gg-row-title">{guess.title}</span>
      <span className={`gg-clue ${samePlatform ? 'gg-hit' : ''}`} title={samePlatform ? 'Same platform' : 'Different platform'}>
        <PlatformBadge platform={guess.platform} />
      </span>
      <span className={`gg-clue ${year === '✓' ? 'gg-hit' : ''}`} title="Year acquired: the answer's is higher (↑) or lower (↓)">
        {gy || '—'} {year}
      </span>
      <span className={`gg-clue ${rating === '✓' ? 'gg-hit' : ''}`} title="Rating: the answer's is higher (↑) or lower (↓)">
        {guess.rating ?? '—'} {rating}
      </span>
    </li>
  );
}

function GuessInput({ games, onGuess, disabled }: { games: Game[]; onGuess: (g: Game) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => {
    const terms = norm(text).split(' ').filter(Boolean);
    if (!terms.length) return [];
    return games
      .filter((g) => terms.every((t) => norm(`${g.title} ${g.platform}`).includes(t)))
      .sort((a, b) => Number(norm(b.title).startsWith(terms[0])) - Number(norm(a.title).startsWith(terms[0])) || a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [games, text]);
  const choose = (g: Game) => {
    onGuess(g);
    setText('');
    setActive(0);
  };
  return (
    <div className="picker-title gg-input">
      <input
        className="search"
        value={text}
        disabled={disabled}
        placeholder="Type a game from the collection…"
        aria-label="Your guess"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        onChange={(e) => (setText(e.target.value), setActive(0))}
        onKeyDown={(e) => {
          if (!suggestions.length) return;
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, suggestions.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
          else if (e.key === 'Enter') (e.preventDefault(), choose(suggestions[active]));
          else if (e.key === 'Escape') setText('');
        }}
      />
      {suggestions.length > 0 && (
        <ul className="picker-list" role="listbox">
          {suggestions.map((g, i) => (
            <li key={g.id} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(g)}>
                <span>{g.title}</span> <PlatformBadge platform={g.platform} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A cover from the collection, blurred and zoomed in, clearer with every wrong guess. Play as many as you like. */
export default function GuessView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  // Only copies that came with their own cover art; a stand-in picture would make the blur unguessable.
  const pool = useMemo(() => games.filter((g) => g.cover && (g.condition.includes('Cover') || g.condition.includes('Cover*'))), [games]);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  // One photo can hold a compilation's whole line-up, and nothing in it says which game is meant.
  const byCover = useMemo(() => {
    const m = new Map<string, Game[]>();
    for (const g of pool) m.set(g.cover!, [...(m.get(g.cover!) ?? []), g]);
    return m;
  }, [pool]);
  const [stats, setStats] = useState<Stats>(load);
  const [round, setRound] = useState<Round | null>(() => (pool.length ? pick(pool, stats.recent) : null));
  // Counts each round once, so the cover changes without replaying the reveal.
  const [rounds, setRounds] = useState(0);

  const answer = round && byId.get(round.id);
  if (!round || !answer) return <div className="empty">No covers to guess yet.</div>;

  // Every game on the cover is an answer; any of them wins the round.
  const answers = byCover.get(answer.cover!) ?? [answer];
  const isRight = (g: Game) => answers.some((a) => norm(g.title) === norm(a.title));

  const over = round.won || round.guesses.length >= TRIES;
  const step = over ? null : STEPS[Math.min(round.guesses.length, STEPS.length - 1)];
  // Where the zoom points: somewhere near the middle, different for each cover.
  const origin = `${30 + ((answer.id * 37) % 41)}% ${30 + ((answer.id * 53) % 41)}%`;

  const record = (next: Round) => {
    setRound(next);
    if (!(next.won || next.guesses.length >= TRIES)) return;
    const streak = next.won ? stats.streak + 1 : 0;
    const updated = {
      played: stats.played + 1,
      won: stats.won + Number(next.won),
      streak,
      best: Math.max(stats.best, streak),
      recent: [next.id, ...stats.recent.filter((id) => id !== next.id)].slice(0, RECENT),
    };
    setStats(updated);
    save(updated);
  };
  const guess = (g: Game) => {
    if (over || round.guesses.includes(g.id)) return;
    record({ ...round, guesses: [...round.guesses, g.id], won: isRight(g) });
  };
  // A skip counts as a wrong guess; -1 is no game.
  const skip = () => !over && record({ ...round, guesses: [...round.guesses, -1] });
  const next = () => {
    setRound(pick(pool, stats.recent));
    setRounds((n) => n + 1);
  };

  const guesses = round.guesses.map((id) => byId.get(id)).filter((g): g is Game => !!g);

  return (
    <div className="guess">
      <header className="gg-head">
        <div>
          <h2>Guess the Game</h2>
          <p className="muted">A cover from the collection, blurred and zoomed in. Every wrong guess shows more. {TRIES} tries.</p>
        </div>
        {stats.played > 0 && (
          <div className="gg-stats">
            <span>
              <b>{stats.played}</b> played
            </span>
            <span>
              <b>{Math.round((stats.won / stats.played) * 100)}%</b> won
            </span>
            <span>
              <b>{stats.streak}</b> streak
            </span>
            <span>
              <b>{stats.best}</b> best
            </span>
          </div>
        )}
      </header>

      <div className="gg-main">
        <div className="gg-cover" aria-label={over ? `The cover of ${answer.title}` : 'A blurred, zoomed-in cover'} role="img">
          {/* A new element for each round, so a new cover starts blurred instead of easing in from the last reveal. */}
          <img
            key={rounds}
            src={imageUrl(answer.cover!)}
            alt=""
            draggable={false}
            style={step ? { filter: `blur(${step.blur}px)`, transform: `scale(${step.zoom})`, transformOrigin: origin } : undefined}
          />
        </div>

        <div className="gg-side">
          {over ? (
            <div className={`gg-result ${round.won ? 'gg-won' : 'gg-lost'}`}>
              <span className="eyebrow">{round.won ? `Got it in ${round.guesses.length}` : 'Out of tries'}</span>
              <div className="gg-answers">
                {answers.map((g) => (
                  <button key={g.id} className="gg-answer" onClick={() => onOpen(g)}>
                    {g.title}
                  </button>
                ))}
              </div>
              <span className="gg-answer-meta">
                <PlatformBadge platform={answer.platform} />
                {answers.length === 1 && <RatingBadge rating={answer.rating} />}
                {yearOf(answer) && <span className="muted">acquired {yearOf(answer)}</span>}
              </span>
              {answers.length > 1 && <p className="muted gg-legend">One cover, {answers.length} games — any of them counted.</p>}
              <div className="gg-actions">
                <button className="btn primary" onClick={next} autoFocus>
                  Next cover
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="gg-play">
                <GuessInput games={games} onGuess={guess} disabled={over} />
                <button className="btn gg-skip-btn" onClick={skip}>
                  Skip
                </button>
              </div>
              <p className="muted gg-left">
                {TRIES - round.guesses.length} of {TRIES} tries left. Any platform's copy counts.
              </p>
            </>
          )}

          {round.guesses.length > 0 && (
            <ol className="gg-rows">
              {round.guesses.map((id, i) => {
                const g = byId.get(id);
                return g ? (
                  <GuessRow key={i} guess={g} answer={answer} right={isRight(g)} />
                ) : (
                  <li key={i} className="gg-row gg-skip">
                    Skipped
                  </li>
                );
              })}
            </ol>
          )}
          {guesses.length > 0 && <p className="muted gg-legend">↑ ↓ point to the answer's acquired year and rating; green is a match.</p>}
        </div>
      </div>
    </div>
  );
}
