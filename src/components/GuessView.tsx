import { useMemo, useState } from 'react';
import type { Game } from '../types';
import { acquiredSortKey, imageUrl } from '../lib/format';
import { PlatformBadge, RatingBadge } from './Badges';
import { toIso, daysBetween } from './ActivityCalendar';

/** Guesses before the cover is shown whole. */
const TRIES = 6;
/** The first daily puzzle; puzzle numbers count from here. */
const FIRST_DAY = '2026-10-27';
const STORE = 'guess-the-game';
/** How blurred and how zoomed the cover is after each wrong guess. */
const STEPS = [
  { blur: 9, zoom: 2.4 },
  { blur: 7, zoom: 2 },
  { blur: 5, zoom: 1.7 },
  { blur: 3.5, zoom: 1.4 },
  { blur: 2, zoom: 1.2 },
  { blur: 1, zoom: 1.05 },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const yearOf = (g: Game) => acquiredSortKey(g.acquired).slice(0, 4);

/** A number from a string that stays the same for the same string. */
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

type Day = { guesses: number[]; won: boolean };
type Saved = Record<string, Day>;

// Saved results live only in this browser; without storage the game still plays, it just forgets.
function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Saved;
  } catch {
    return {};
  }
}
function save(all: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* nothing to do */
  }
}

/** Days won in a row, up to today or yesterday. */
function streak(all: Saved, today: string) {
  let day = all[today]?.won ? today : toIso(new Date(new Date(`${today}T12:00:00`).getTime() - 86_400_000));
  let n = 0;
  while (all[day]?.won) {
    n++;
    day = toIso(new Date(new Date(`${day}T12:00:00`).getTime() - 86_400_000));
  }
  return n;
}

function GuessRow({ guess, answer }: { guess: Game; answer: Game }) {
  const right = norm(guess.title) === norm(answer.title);
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

/** A daily puzzle: a cover from the collection, blurred and zoomed in, clearer with every wrong guess. */
export default function GuessView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const today = toIso(new Date());
  const number = daysBetween(FIRST_DAY, today) + 1;
  const pool = useMemo(() => games.filter((g) => g.cover && !g.condition.includes('Built-in Console')).sort((a, b) => a.id - b.id), [games]);
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const [saved, setSaved] = useState<Saved>(load);
  // Practice rounds are a random cover each, and aren't saved.
  const [practice, setPractice] = useState<{ id: number; day: Day } | null>(null);
  const [copied, setCopied] = useState(false);

  const daily = pool.length ? pool[hash(today) % pool.length] : null;
  const answer = practice ? byId.get(practice.id)! : daily;
  const day = practice ? practice.day : (saved[today] ?? { guesses: [], won: false });
  const over = day.won || day.guesses.length >= TRIES;
  if (!answer) return <div className="empty">No covers to guess yet.</div>;

  const guesses = day.guesses.map((id) => byId.get(id)).filter((g): g is Game => !!g);
  const step = over ? null : STEPS[Math.min(day.guesses.length, STEPS.length - 1)];
  // Where the zoom points: somewhere near the middle, the same for the same cover.
  const seed = hash(`${answer.id}`);
  const origin = `${30 + (seed % 41)}% ${30 + ((seed >> 8) % 41)}%`;

  const record = (next: Day) => {
    if (practice) return setPractice({ ...practice, day: next });
    const all = { ...saved, [today]: next };
    setSaved(all);
    save(all);
  };
  const guess = (g: Game) => {
    if (over || day.guesses.includes(g.id)) return;
    record({ guesses: [...day.guesses, g.id], won: norm(g.title) === norm(answer.title) });
  };
  // A skip counts as a wrong guess; -1 is no game.
  const skip = () => !over && record({ guesses: [...day.guesses, -1], won: false });

  const played = Object.values(saved).filter((d) => d.won || d.guesses.length >= TRIES);
  const won = played.filter((d) => d.won).length;

  const share = () => {
    const squares = day.guesses.map((id) => {
      const g = byId.get(id);
      if (!g) return '⬛';
      if (norm(g.title) === norm(answer.title)) return '🟩';
      return g.platform === answer.platform ? '🟨' : '🟥';
    });
    const text = `Guess the Game #${number} ${day.won ? day.guesses.length : 'X'}/${TRIES}\n${squares.join('')}\n${location.origin}${location.pathname}?tab=guess`;
    navigator.clipboard?.writeText(text).then(
      () => (setCopied(true), setTimeout(() => setCopied(false), 2000)),
      () => undefined,
    );
  };

  return (
    <div className="guess">
      <header className="gg-head">
        <div>
          <span className="eyebrow">{practice ? 'Practice round' : `Daily puzzle #${number}`}</span>
          <h2>Guess the Game</h2>
          <p className="muted">
            A cover from the collection, blurred and zoomed in. Every wrong guess shows more. {TRIES} tries.
          </p>
        </div>
        {!practice && played.length > 0 && (
          <div className="gg-stats">
            <span>
              <b>{played.length}</b> played
            </span>
            <span>
              <b>{Math.round((won / played.length) * 100)}%</b> won
            </span>
            <span>
              <b>{streak(saved, today)}</b> streak
            </span>
          </div>
        )}
      </header>

      <div className="gg-main">
        <div className="gg-cover" aria-label={over ? `The cover of ${answer.title}` : 'A blurred, zoomed-in cover'} role="img">
          <img
            src={imageUrl(answer.cover!)}
            alt=""
            draggable={false}
            style={step ? { filter: `blur(${step.blur}px)`, transform: `scale(${step.zoom})`, transformOrigin: origin } : undefined}
          />
        </div>

        <div className="gg-side">
          {over ? (
            <div className={`gg-result ${day.won ? 'gg-won' : 'gg-lost'}`}>
              <span className="eyebrow">{day.won ? `Got it in ${day.guesses.length}` : 'Out of tries'}</span>
              <button className="gg-answer" onClick={() => onOpen(answer)}>
                {answer.title}
              </button>
              <span className="gg-answer-meta">
                <PlatformBadge platform={answer.platform} />
                <RatingBadge rating={answer.rating} />
                {yearOf(answer) && <span className="muted">acquired {yearOf(answer)}</span>}
              </span>
              <div className="gg-actions">
                {!practice && (
                  <button className="btn primary" onClick={share}>
                    {copied ? 'Copied' : 'Share result'}
                  </button>
                )}
                <button className="btn" onClick={() => setPractice({ id: pool[Math.floor(Math.random() * pool.length)].id, day: { guesses: [], won: false } })}>
                  {practice ? 'Another one' : 'Practice round'}
                </button>
                {practice && (
                  <button className="btn" onClick={() => setPractice(null)}>
                    Back to today's
                  </button>
                )}
              </div>
              {!practice && <p className="muted gg-next">A new cover tomorrow.</p>}
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
                {TRIES - day.guesses.length} of {TRIES} tries left. Any platform's copy counts.
              </p>
            </>
          )}

          {day.guesses.length > 0 && (
            <ol className="gg-rows">
              {day.guesses.map((id, i) => {
                const g = byId.get(id);
                return g ? (
                  <GuessRow key={i} guess={g} answer={answer} />
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
