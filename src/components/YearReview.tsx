import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AwardValue, Game, GameRef, GotcYear } from '../types';
import { isGameRef } from '../lib/links';
import { PODIUM, isGenreAward, isPlatformAward, isQuarter } from '../lib/awards';
import { RefCover } from './GameRefView';

interface Props {
  year: GotcYear;
  /** The year before, for comparing the numbers; null for the first year. */
  previous: GotcYear | null;
  link: (ref: GameRef) => Game | null;
  onClose: () => void;
  /** Starts the review of another year (the one before), when there is one. */
  onOpenYear?: (year: number) => void;
}

interface Slide {
  key: string;
  /** Background of the slide, as a CSS colour; the slides take turns. */
  tone: string;
  body: React.ReactNode;
  /** The Game of the Year slide gets confetti. */
  celebrate?: boolean;
}

const TONES = ['#2b1d5c', '#0f3b4a', '#4a1d3a', '#1f3b22', '#4a2d12', '#162a52'];

/** Special awards, in the order they're shown, with what to call them on the slide. */
const SPECIALS: [string, string][] = [
  ['Favourite Platinum', 'Favourite Platinum'],
  ['Co-op GOTY', 'Co-op Game of the Year'],
  ['Best Non-English Game', 'Best Non-English Game'],
  ['Best Game in 🐥 Opinion', "🐥's pick"],
  ['Games from Slavica GOTY', 'Best game from Slavica'],
  ['Best Cover Art', 'Best Cover Art'],
  ['Best Game Not Finished', 'Best Game Not Finished'],
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "+12 on 2024", "−3 on 2024" or "same as 2024". */
function versus(now: number | undefined, then: number | undefined, year: number | undefined): string | null {
  if (now === undefined || then === undefined || year === undefined) return null;
  const d = now - then;
  return d === 0 ? `same as ${year}` : `${d > 0 ? '+' : '−'}${Math.abs(d)} on ${year}`;
}

function GameCard({ value, link, size = 'medium', label }: { value: GameRef; link: Props['link']; size?: 'small' | 'medium' | 'large'; label?: string }) {
  return (
    <figure className={`yr-game yr-game-${size}`}>
      <span className="yr-cover">
        <RefCover entry={value} game={link(value)} />
      </span>
      <figcaption>
        {label && <span className="yr-label">{label}</span>}
        <b>{value.title}</b>
        <span className="yr-platform">{value.platform}</span>
      </figcaption>
    </figure>
  );
}

function buildSlides(year: GotcYear, previous: GotcYear | null, link: Props['link']): Slide[] {
  const award = (category: string): AwardValue | null => year.awards.find((a) => a.category === category)?.winner ?? null;
  const game = (category: string): GameRef | null => {
    const v = award(category);
    return v && isGameRef(v) ? v : null;
  };
  const won = (test: (c: string) => boolean) =>
    year.awards.filter((a) => test(a.category) && a.winner && isGameRef(a.winner)).map((a) => ({ category: a.category, game: a.winner as GameRef }));
  const s = year.stats;
  const slides: Omit<Slide, 'tone'>[] = [];

  slides.push({
    key: 'intro',
    body: (
      <div className="yr-center">
        <span className="yr-kicker">Year in Review</span>
        <span className="yr-huge">{year.year}</span>
        <p className="yr-note">A year of games, as the awards remember it.</p>
      </div>
    ),
  });

  if (s.gamesBought !== undefined || s.gamesCompleted !== undefined) {
    const before = previous?.year;
    slides.push({
      key: 'numbers',
      body: (
        <div className="yr-center">
          <span className="yr-kicker">The numbers</span>
          <div className="yr-numbers">
            {s.gamesBought !== undefined && (
              <div>
                <span className="yr-big">{s.gamesBought}</span>
                <span>games bought</span>
                <small>{versus(s.gamesBought, previous?.stats.gamesBought, before)}</small>
              </div>
            )}
            {s.gamesCompleted !== undefined && (
              <div>
                <span className="yr-big">{s.gamesCompleted}</span>
                <span>games completed</span>
                <small>{versus(s.gamesCompleted, previous?.stats.gamesCompleted, before)}</small>
              </div>
            )}
          </div>
          {s.gamesBought !== undefined && s.gamesCompleted ? (
            <p className="yr-note">That's {(s.gamesBought / s.gamesCompleted).toFixed(1)} games bought for every one finished.</p>
          ) : null}
          {s.consolesBought?.length ? (
            <div className="yr-chips">
              <span className="yr-label">New {s.consolesBought.length === 1 ? 'console' : 'consoles'}</span>
              {s.consolesBought.map((c) => (
                <span key={c} className="yr-chip">
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ),
    });
  }

  const quarters = won(isQuarter);
  if (quarters.length) {
    slides.push({
      key: 'quarters',
      body: (
        <>
          <span className="yr-kicker">Quarter by quarter</span>
          <h2 className="yr-title">The best of each quarter</h2>
          <div className="yr-grid yr-grid-2">
            {quarters.map((q) => (
              <GameCard key={q.category} value={q.game} link={link} size="small" label={q.category.replace('Best Game of ', '')} />
            ))}
          </div>
        </>
      ),
    });
  }

  for (const [key, title, test, strip] of [
    ['platforms', 'Platform champions', isPlatformAward, / GOTY$/],
    ['genres', 'Genre champions', isGenreAward, /( Game)? GOTY$/],
  ] as const) {
    const list = won(test);
    if (!list.length) continue;
    slides.push({
      key,
      body: (
        <>
          <span className="yr-kicker">{plural(list.length, 'winner')}</span>
          <h2 className="yr-title">{title}</h2>
          <ul className="yr-list yr-list-2">
            {list.map((w) => (
              <li key={w.category}>
                <span className="yr-thumb">
                  <RefCover entry={w.game} game={link(w.game)} />
                </span>
                <span>
                  <span className="yr-label">{w.category.replace(strip, '')}</span>
                  <b>{w.game.title}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  const surprise = game('Biggest Surprise');
  const letdown = game('Biggest Dissapointment');
  if (surprise || letdown) {
    slides.push({
      key: 'surprise',
      body: (
        <>
          <span className="yr-kicker">Expectations</span>
          <h2 className="yr-title">Ups and downs</h2>
          <div className="yr-versus">
            {surprise && <GameCard value={surprise} link={link} label="😮 Biggest surprise" />}
            {letdown && <GameCard value={letdown} link={link} label="😞 Biggest disappointment" />}
          </div>
        </>
      ),
    });
  }

  const moment = game('Most Memorable Moment');
  if (moment || s.honorableMentions?.length) {
    const mentions = s.honorableMentions ?? [];
    slides.push({
      key: 'moment',
      body: (
        <>
          <span className="yr-kicker">Moment of the Year</span>
          {moment ? <h2 className="yr-title yr-quote">“{moment.title}”</h2> : <h2 className="yr-title">Moments</h2>}
          {moment && <p className="yr-note yr-quote-by">{moment.platform}</p>}
          {mentions.length > 0 && (
            <div className="yr-mentions">
              <span className="yr-label">Honourable mentions</span>
              <ul>
                {mentions.slice(0, 8).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
                {mentions.length > 8 && <li className="yr-more">and {mentions.length - 8} more</li>}
              </ul>
            </div>
          )}
        </>
      ),
    });
  }

  const specials = SPECIALS.flatMap(([category, label]) => {
    const g = game(category);
    return g ? [{ label, g }] : [];
  });
  if (specials.length) {
    slides.push({
      key: 'specials',
      body: (
        <>
          <span className="yr-kicker">Special awards</span>
          <h2 className="yr-title">And the award goes to…</h2>
          <ul className="yr-list">
            {specials.map(({ label, g }) => (
              <li key={label}>
                <span className="yr-thumb">
                  <RefCover entry={g} game={link(g)} />
                </span>
                <span>
                  <span className="yr-label">{label}</span>
                  <b>{g.title}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (s.ratingChanges?.length || s.multipleGotmWinners?.length) {
    slides.push({
      key: 'changes',
      body: (
        <>
          <span className="yr-kicker">Second thoughts</span>
          <h2 className="yr-title">{s.ratingChanges?.length ? 'Ratings that changed' : 'Back for more'}</h2>
          {s.ratingChanges?.length ? (
            <ul className="yr-changes">
              {s.ratingChanges.map((r) => (
                <li key={r.title}>
                  <span>{r.title}</span>
                  <span className="yr-delta">
                    {r.from} → <b className={r.to < r.from ? 'down' : 'up'}>{r.to}</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.multipleGotmWinners?.length ? (
            <div className="yr-mentions">
              <span className="yr-label">Game of the Month more than once</span>
              <div className="yr-grid yr-grid-3">
                {s.multipleGotmWinners.map((g) => (
                  <GameCard key={g.title} value={g} link={link} size="small" />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ),
    });
  }

  const consoleOfTheYear = award('Console of the Year');
  if (consoleOfTheYear && !isGameRef(consoleOfTheYear)) {
    slides.push({
      key: 'console',
      body: (
        <div className="yr-center">
          <span className="yr-kicker">Console of the Year</span>
          <span className="yr-console">{consoleOfTheYear.text}</span>
        </div>
      ),
    });
  }

  // The countdown: third place, runner-up, then the Game of the Year.
  const places = [
    ['🥉', 'Third place'],
    ['🥈', 'Runner-up'],
    ['🥇', `Game of the Year ${year.year}`],
  ];
  [...PODIUM].reverse().forEach((category, i) => {
    const g = game(category);
    if (!g) return;
    const last = i === 2;
    slides.push({
      key: category,
      celebrate: last,
      body: (
        <div className={`yr-center ${last ? 'yr-winner' : ''}`}>
          <span className="yr-kicker">
            {places[i][0]} {places[i][1]}
          </span>
          <GameCard value={g} link={link} size="large" />
        </div>
      ),
    });
  });

  return slides.map((slide, i) => ({ ...slide, tone: TONES[i % TONES.length] }));
}

export function YearReview({ year, previous, link, onClose, onOpenYear }: Props) {
  const slides = useMemo(() => {
    const built = buildSlides(year, previous, link);
    built.push({
      key: 'outro',
      tone: TONES[built.length % TONES.length],
      body: (
        <div className="yr-center">
          <span className="yr-kicker">That was</span>
          <span className="yr-huge">{year.year}</span>
          <div className="yr-actions">
            <button className="yr-button" onClick={onClose}>
              See all the {year.year} awards
            </button>
            {previous && onOpenYear && (
              <button className="yr-button ghost" onClick={() => onOpenYear(previous.year)}>
                ◀ {previous.year} in review
              </button>
            )}
          </div>
        </div>
      ),
    });
    return built;
  }, [year, previous, link, onClose, onOpenYear]);

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [year.year]);
  const go = useCallback((d: number) => setIndex((i) => Math.min(Math.max(i + d, 0), slides.length - 1)), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ') (e.preventDefault(), go(1));
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    // The page behind stays put while the review is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  const slide = slides[index];
  // A tap on the left third goes back, anywhere else goes on; buttons inside the slide do their own thing.
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width / 3 ? -1 : 1);
  };

  return (
    <div className="yr-backdrop" role="dialog" aria-modal="true" aria-label={`${year.year} in review`}>
      <button className="yr-side prev" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous">
        ‹
      </button>
      <div className="yr-story" style={{ '--tone': slide.tone } as React.CSSProperties}>
        <div className="yr-progress" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.key} className={i < index ? 'done' : i === index ? 'now' : ''} />
          ))}
        </div>
        <button className="yr-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="yr-slide" key={slide.key} onClick={onTap} aria-live="polite">
          {slide.celebrate && (
            <div className="yr-confetti" aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
          )}
          {slide.body}
        </div>
        <span className="yr-count" aria-hidden="true">
          {index + 1} / {slides.length}
        </span>
      </div>
      <button className="yr-side next" onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Next">
        ›
      </button>
    </div>
  );
}
