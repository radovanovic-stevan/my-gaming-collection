import type { Game, GameRef, PlayStatus } from '../types';
import { platformHue } from '../lib/format';
import { Cover } from './Cover';
import { PlatformBadge } from './Badges';

export const PLAY_STATUS: Record<PlayStatus, { emoji: string; label: string }> = {
  completed: { emoji: '✅', label: 'Completed' },
  'in-progress': { emoji: '⏳', label: 'In progress' },
  played: { emoji: '➖', label: 'Played (no ending)' },
  'post-completion': { emoji: '✨', label: 'Played after completing' },
};

export function StatusEmoji({ status }: { status: PlayStatus | null }) {
  if (!status) return <span className="play-status muted" title="Not marked yet">·</span>;
  const { emoji, label } = PLAY_STATUS[status];
  return (
    <span className="play-status" title={label} aria-label={label}>
      {emoji}
    </span>
  );
}

/** Cover of the linked collection game, or a platform-coloured placeholder. */
export function RefCover({ entry, game }: { entry: GameRef; game: Game | null }) {
  if (game) return <Cover game={game} />;
  return (
    <div className="cover cover-placeholder" style={{ '--hue': platformHue(entry.platform) } as React.CSSProperties}>
      <span className="cover-placeholder-platform">{entry.platform}</span>
      <span className="cover-placeholder-title">{entry.title}</span>
    </div>
  );
}

/**
 * Title + platform of a game named in the award sheets. When it matches a game in
 * the collection, it's a button that opens that game's details.
 */
export function RefTitle({ entry, game, onOpen }: { entry: GameRef; game: Game | null; onOpen: (game: Game) => void }) {
  const content = (
    <>
      <span className="ref-title">{entry.title}</span> <PlatformBadge platform={entry.platform} />
    </>
  );
  return game ? (
    <button className="ref-link" onClick={() => onOpen(game)} title="Open in collection">
      {content}
    </button>
  ) : (
    <span className="ref-plain" title="Not found in the collection">
      {content}
    </span>
  );
}
