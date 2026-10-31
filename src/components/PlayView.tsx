import { useState } from 'react';
import type { Game } from '../types';
import GuessView from './GuessView';
import HigherLowerView from './HigherLowerView';

const MODES = [
  { id: 'guess', label: 'Guess the Game' },
  { id: 'higher-lower', label: 'Higher or Lower' },
] as const;

type Mode = (typeof MODES)[number]['id'];

/** The games played with the collection itself; the mode sits above them so each keeps its own stats. */
export default function PlayView({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const [mode, setMode] = useState<Mode>('guess');
  return (
    <div className="play">
      <div className="segmented play-modes" role="group" aria-label="Game">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'on' : ''} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'guess' ? <GuessView games={games} onOpen={onOpen} /> : <HigherLowerView games={games} onOpen={onOpen} />}
    </div>
  );
}
