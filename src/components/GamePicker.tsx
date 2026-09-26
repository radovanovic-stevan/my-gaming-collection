import { useId, useMemo, useState } from 'react';
import type { Game } from '../types';
import { PlatformBadge } from './Badges';

export interface PickerValue {
  title: string;
  platform: string;
}

interface Props {
  value: PickerValue;
  onChange: (value: PickerValue) => void;
  games: Game[];
  link: (ref: PickerValue) => Game | null;
  placeholder?: string;
  /** Award winners may be plain text (a console, a moment), so the platform is optional there. */
  platformOptional?: boolean;
  autoFocus?: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');

/** Title + platform inputs with suggestions from the collection. Anything typed is accepted too. */
export function GamePicker({ value, onChange, games, link, placeholder = 'Game title', platformOptional, autoFocus }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const platforms = useMemo(() => [...new Set(games.map((g) => g.platform))].sort(), [games]);

  const suggestions = useMemo(() => {
    const terms = norm(value.title).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return games
      .filter((g) => {
        const hay = norm(`${g.title} ${g.platform}`);
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => Number(norm(b.title).startsWith(terms[0])) - Number(norm(a.title).startsWith(terms[0])) || (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 8);
  }, [games, value.title]);

  const choose = (g: Game) => {
    onChange({ title: g.title, platform: g.platform });
    setOpen(false);
  };

  const linked = value.title && value.platform ? link(value) : null;

  return (
    <div className="picker">
      <div className="picker-inputs">
        <div className="picker-title">
          <input
            value={value.title}
            placeholder={placeholder}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            onChange={(e) => {
              onChange({ ...value, title: e.target.value });
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (!open || !suggestions.length) return;
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, suggestions.length - 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
              else if (e.key === 'Enter') (e.preventDefault(), choose(suggestions[active]));
              else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false));
            }}
          />
          {open && suggestions.length > 0 && (
            <ul className="picker-list" id={listId} role="listbox">
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
        <input
          className="picker-platform"
          list={`${listId}-platforms`}
          value={value.platform}
          placeholder="Platform"
          onChange={(e) => onChange({ ...value, platform: e.target.value })}
          aria-label="Platform"
        />
        <datalist id={`${listId}-platforms`}>
          {platforms.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      {value.title && (
        <span className={`picker-hint ${linked ? 'ok' : ''}`}>
          {linked ? '✓ In your collection' : value.platform || !platformOptional ? 'Not in the collection' : 'Saved as text'}
        </span>
      )}
    </div>
  );
}
