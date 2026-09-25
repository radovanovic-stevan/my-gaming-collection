import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../types';
import { STATUSES } from '../types';
import { api, type GameInput } from '../lib/api';
import { facet } from '../lib/query';
import { genreLabel } from '../lib/format';

interface Props {
  /** Game to edit, or null to add a new one. */
  game: Game | null;
  allGames: Game[];
  onSaved: (game: Game) => void;
  onClose: () => void;
}

interface FormState {
  title: string;
  platform: string;
  status: string;
  rating: string;
  acquired: string;
  completed: string;
  timesCompleted: string;
  percent: string;
  playtime: string;
  genres: string[];
  condition: string[];
  edition: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const minutesToText = (m: number | null) => (m === null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);

function textToMinutes(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d+)(?::(\d{1,2}))?$/);
  if (!m) throw new Error('Playtime should look like 12:30 (hours:minutes)');
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

function toForm(g: Game | null): FormState {
  return {
    title: g?.title ?? '',
    platform: g?.platform ?? '',
    status: g?.status ?? 'Not Completed',
    rating: g?.rating?.toString() ?? '',
    acquired: g ? (g.acquired ?? '') : today(),
    completed: g?.completed ?? '',
    timesCompleted: g?.timesCompleted?.toString() ?? (g ? '' : '0'),
    percent: g?.percent?.toString() ?? '',
    playtime: minutesToText(g?.playtime ?? null),
    genres: g?.genres ?? [],
    condition: g?.condition ?? ['Box', 'Cover', 'Manual'],
    edition: g?.edition ?? '',
  };
}

function toInput(f: FormState): GameInput {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    title: f.title,
    platform: f.platform,
    status: f.status as Game['status'],
    rating: num(f.rating),
    acquired: f.acquired.trim() || null,
    completed: f.completed.trim() || null,
    timesCompleted: num(f.timesCompleted),
    percent: num(f.percent),
    playtime: textToMinutes(f.playtime),
    genres: f.genres,
    condition: f.condition,
    edition: f.edition,
  };
}

function TagPicker({ options, value, onChange, label = (v: string) => v }: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label?: (v: string) => string;
}) {
  const [custom, setCustom] = useState('');
  const all = [...new Set([...options, ...value])];
  const add = () => {
    const v = custom.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setCustom('');
  };
  return (
    <div>
      <div className="chips">
        {all.map((o) => (
          <button
            type="button"
            key={o}
            className={`chip ${value.includes(o) ? 'on' : ''}`}
            aria-pressed={value.includes(o)}
            onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}
          >
            {label(o)}
          </button>
        ))}
      </div>
      <input
        className="tag-input"
        placeholder="Add another…"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export function GameForm({ game, allGames, onSaved, onClose }: Props) {
  const [form, setForm] = useState(() => toForm(game));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => ({
      platforms: facet(allGames, (g) => [g.platform]).map(([v]) => v),
      genres: facet(allGames, (g) => g.genres).map(([v]) => v),
      conditions: facet(allGames, (g) => g.condition).map(([v]) => v),
    }),
    [allGames],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(key, e.target.value),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = toInput(form);
      onSaved(game ? await api.update(game.id, input) : await api.create(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal game-form" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={game ? 'Edit game' : 'Add game'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{game ? `Edit #${game.id}` : 'Add a game'}</h2>

        <div className="form-grid">
          <label className="field span-2">
            <span>Title *</span>
            <input required autoFocus {...field('title')} />
          </label>
          <label className="field">
            <span>Platform *</span>
            <input required list="platform-options" {...field('platform')} />
            <datalist id="platform-options">
              {options.platforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Status</span>
            <select {...field('status')}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rating (0–100)</span>
            <input type="number" min={0} max={100} step={0.5} {...field('rating')} />
          </label>
          <label className="field">
            <span>Times completed</span>
            <input type="number" min={0} step={1} {...field('timesCompleted')} />
          </label>
          <label className="field">
            <span>Acquired</span>
            <input placeholder="YYYY-MM-DD or text" {...field('acquired')} />
          </label>
          <label className="field">
            <span>Completed on</span>
            <div className="input-with-btn">
              <input placeholder="YYYY-MM-DD or text" {...field('completed')} />
              <button type="button" className="btn" onClick={() => set('completed', today())}>
                Today
              </button>
            </div>
          </label>
          <label className="field">
            <span>% complete</span>
            <input type="number" min={0} max={100} step="any" {...field('percent')} />
          </label>
          <label className="field">
            <span>Playtime (h:mm)</span>
            <input placeholder="12:30" {...field('playtime')} />
          </label>
          <label className="field span-2">
            <span>Edition</span>
            <input placeholder="e.g. Platinum, GOTY" {...field('edition')} />
          </label>
          <div className="field span-2">
            <span>Genres</span>
            <TagPicker options={options.genres} value={form.genres} onChange={(v) => set('genres', v)} label={genreLabel} />
          </div>
          <div className="field span-2">
            <span>Condition</span>
            <TagPicker options={options.conditions} value={form.condition} onChange={(v) => set('condition', v)} />
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : game ? 'Save changes' : 'Add game'}
          </button>
        </div>
      </form>
    </div>
  );
}
