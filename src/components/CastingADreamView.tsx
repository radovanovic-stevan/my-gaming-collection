import { useMemo } from 'react';
import type { CastingADream, Game, LauncherGame } from '../types';
import { earnedCount, matchLauncherGames } from '../lib/castingADream';
import { useFocus } from '../lib/focus';
import { formatDate, formatPlaytime, imageUrl } from '../lib/format';
import { Cover } from './Cover';

/** Pictures of the launcher in public/images. */
const SCREENSHOTS: { file: string; caption: string }[] = [
  { file: 'casting-a-dream-library-a3696aab.jpg', caption: 'The library: every game in one place, with play time and a link to it in this collection.' },
];

interface Props {
  data: CastingADream;
  /** The collection, with the launcher's play time already applied. */
  games: Game[];
  onOpen: (game: Game) => void;
  /** A collection game id whose trophies to scroll to. */
  focus?: number;
  onFocused?: () => void;
}

/** As the launcher words it: "18m played", "Under a minute played", "No time tracked yet" (played before tracking), "Not played yet". */
function playedText(lg: LauncherGame): string {
  if (lg.minutes === undefined) return lg.lastPlayed ? 'No time tracked yet' : 'Not played yet';
  return lg.minutes < 1 ? 'Under a minute played' : `${formatPlaytime(lg.minutes)} played`;
}

const trophiesId = (lg: LauncherGame, game: Game | undefined) => `cad-trophies-${game?.id ?? lg.title}`;

export function CastingADreamView({ data, games, onOpen, focus, onFocused }: Props) {
  // Matched against the collection as shown, so a game's cover and play time are the current ones.
  const matched = useMemo(() => matchLauncherGames(data, games), [data, games]);

  const groups = useMemo(
    () =>
      data.systems
        .map((s) => ({ ...s, games: data.games.filter((g) => g.platform === s.platform) }))
        .filter((s) => s.games.length),
    [data],
  );
  const withTrophies = data.games.filter((g) => g.trophies?.length);
  const minutes = data.games.reduce((n, g) => n + (g.minutes ?? 0), 0);
  const earned = withTrophies.reduce((n, g) => n + earnedCount(g), 0);
  const total = withTrophies.reduce((n, g) => n + g.trophies!.length, 0);

  useFocus(focus, onFocused, (id) => {
    const lg = withTrophies.find((g) => matched.get(g)?.id === id);
    return lg ? trophiesId(lg, matched.get(lg)) : undefined;
  });

  return (
    <section className="awards cad">
      <div className="cad-hero">
        <div className="cad-intro">
          <h2>Casting a Dream</h2>
          <p>
            A Mac launcher I built to play the games from my collection that I don't have the hardware for. It keeps them in one library, opens each one
            in its emulator, tracks play time and awards trophies worked out from the games' own saves.
          </p>
          <a className="btn" href={data.repository} target="_blank" rel="noreferrer">
            View on GitHub ↗
          </a>
        </div>
        {SCREENSHOTS.length > 0 && (
          <div className="cad-shots">
            {SCREENSHOTS.map((s) => (
              <figure key={s.file}>
                <a href={imageUrl(s.file)} target="_blank" rel="noreferrer">
                  <img src={imageUrl(s.file)} alt={s.caption} loading="lazy" decoding="async" />
                </a>
                <figcaption className="muted small">{s.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="year-totals">
        <div>
          <b>{data.games.length}</b>
          <span>games</span>
        </div>
        <div>
          <b>{groups.length}</b>
          <span>systems</span>
        </div>
        <div>
          <b>{formatPlaytime(minutes)}</b>
          <span>played</span>
        </div>
        <div>
          <b>
            {earned}/{total}
          </b>
          <span>trophies</span>
        </div>
      </div>

      {groups.map((s) => (
        <div key={s.platform} className="console-group">
          <h3 className="section-title">
            {s.name} <span className="cad-emulator">· {s.emulator}</span>
          </h3>
          <ul className="grid">
            {s.games.map((lg) => {
              const game = matched.get(lg);
              const count = lg.trophies?.length ? `${earnedCount(lg)}/${lg.trophies.length}` : null;
              const cover = game ? (
                <Cover game={game} />
              ) : (
                <div className="cover cover-placeholder">
                  <span className="cover-placeholder-platform">{lg.platform}</span>
                  <span className="cover-placeholder-title">{lg.title}</span>
                </div>
              );
              const body = (
                <>
                  <div className="card-cover">
                    {cover}
                    {count && (
                      <span className="plays-badge cad-trophy-badge" title={`${count} trophies`}>
                        🏆 {count}
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <span className="card-title">{game?.title ?? lg.title}</span>
                    <span className="muted small">
                      {playedText(lg)}
                    </span>
                    {lg.lastPlayed && <span className="muted small">Last played {formatDate(lg.lastPlayed)}</span>}
                  </div>
                </>
              );
              return (
                <li key={lg.title}>
                  {game ? (
                    <button className="card" onClick={() => onOpen(game)} title={game.title}>
                      {body}
                    </button>
                  ) : (
                    <div className="card">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {withTrophies.length > 0 && <h3 className="section-title cad-trophies-title">Trophies</h3>}
      {withTrophies.map((lg) => {
        const game = matched.get(lg);
        const got = earnedCount(lg);
        const all = lg.trophies!.length;
        return (
          <div key={lg.title} id={trophiesId(lg, game)} className="cad-set">
            <div className="cad-set-head">
              <div>
                {game ? (
                  <button className="link cad-set-title" onClick={() => onOpen(game)}>
                    {game.title}
                  </button>
                ) : (
                  <span className="cad-set-title">{lg.title}</span>
                )}
                <span className="muted small">
                  {got} of {all} trophies
                </span>
              </div>
              <div className="cad-progress" role="progressbar" aria-valuemin={0} aria-valuemax={all} aria-valuenow={got}>
                <span style={{ width: `${(got / all) * 100}%` }} />
              </div>
            </div>
            <ul className="cad-trophies">
              {lg.trophies!.map((t, i) => {
                const hidden = t.secret && !t.unlocked;
                return (
                  <li key={t.title ?? `secret-${i}`} className={t.unlocked ? 'earned' : undefined}>
                    <span className="cad-trophy-icon" aria-hidden="true">
                      {t.unlocked ? '🏆' : '🔒'}
                    </span>
                    <div>
                      <b>{hidden ? 'Secret trophy' : t.title}</b>
                      <span className="muted small">{hidden ? 'Keep playing to find out.' : t.detail}</span>
                    </div>
                    {t.unlocked && <span className="cad-unlocked small">{formatDate(t.unlocked)}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
