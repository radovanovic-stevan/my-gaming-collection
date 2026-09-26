import { useEffect, useState } from 'react';
import type { AwardValue, Game, GameRef, GotcYear, GotmMonth } from '../types';
import { api } from '../lib/api';
import { isGameRef } from '../lib/links';
import { GamePicker, type PickerValue } from './GamePicker';

interface Props {
  /** Year to edit, or null to add one (its categories are copied from the latest year). */
  year: GotcYear | null;
  years: GotcYear[];
  /** Game of the Month data, when loaded, to fill in the year's stats. */
  months: GotmMonth[] | null;
  games: Game[];
  link: (ref: GameRef) => Game | null;
  onSaved: (saved: GotcYear, previousKey: number | null) => void;
  onDeleted: (key: number) => void;
  onClose: () => void;
}

interface AwardRow {
  category: string;
  winner: PickerValue;
}

interface ChangeRow {
  title: string;
  from: string;
  to: string;
}

const toPicker = (v: AwardValue | null): PickerValue => (!v ? { title: '', platform: '' } : isGameRef(v) ? { ...v } : { title: v.text, platform: '' });
const fromPicker = (v: PickerValue): AwardValue | null =>
  !v.title.trim() ? null : v.platform.trim() ? { title: v.title, platform: v.platform } : { text: v.title };

export function YearEditor({ year, years, months, games, link, onSaved, onDeleted, onClose }: Props) {
  const template = years[0];
  const [yearNo, setYearNo] = useState(String(year?.year ?? (template ? template.year + 1 : new Date().getFullYear())));
  const [awards, setAwards] = useState<AwardRow[]>(() =>
    year ? year.awards.map((a) => ({ category: a.category, winner: toPicker(a.winner) })) : (template?.awards ?? []).map((a) => ({ category: a.category, winner: toPicker(null) })),
  );
  const s = year?.stats ?? {};
  const [completed, setCompleted] = useState(s.gamesCompleted?.toString() ?? '');
  const [bought, setBought] = useState(s.gamesBought?.toString() ?? '');
  const [consoles, setConsoles] = useState((s.consolesBought ?? []).join(', '));
  const [multi, setMulti] = useState<PickerValue[]>(s.multipleGotmWinners ?? []);
  const [mentions, setMentions] = useState(s.honorableMentions ?? '');
  const [changes, setChanges] = useState<ChangeRow[]>((s.ratingChanges ?? []).map((r) => ({ title: r.title, from: String(r.from), to: String(r.to) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const yearMonths = months?.filter((m) => m.month.startsWith(`${yearNo}-`)) ?? [];

  /** Totals and repeat Game of the Month winners, from the monthly data. */
  const fillFromGotm = () => {
    setCompleted(String(yearMonths.reduce((n, m) => n + (m.completed ?? 0), 0)));
    setBought(String(yearMonths.reduce((n, m) => n + (m.bought ?? 0), 0)));
    const wins = new Map<string, { ref: GameRef; n: number }>();
    for (const m of yearMonths) {
      if (!m.gameOfTheMonth) continue;
      const k = `${m.gameOfTheMonth.title}|${m.gameOfTheMonth.platform}`;
      wins.set(k, { ref: m.gameOfTheMonth, n: (wins.get(k)?.n ?? 0) + 1 });
    }
    setMulti([...wins.values()].filter((w) => w.n > 1).map((w) => ({ title: w.ref.title, platform: w.ref.platform })));
  };

  const updateAward = (i: number, patch: Partial<AwardRow>) => setAwards((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveYear(year?.year ?? Number(yearNo), {
        year: Number(yearNo),
        awards: awards.filter((a) => a.category.trim()).map((a) => ({ category: a.category, winner: fromPicker(a.winner) })),
        stats: {
          gamesCompleted: completed === '' ? undefined : Number(completed),
          gamesBought: bought === '' ? undefined : Number(bought),
          consolesBought: consoles.split(',').map((c) => c.trim()).filter(Boolean),
          multipleGotmWinners: multi.filter((m) => m.title.trim()),
          honorableMentions: mentions,
          ratingChanges: changes.filter((c) => c.title.trim()).map((c) => ({ title: c.title, from: Number(c.from), to: Number(c.to) })),
        },
      });
      onSaved(saved, year?.year ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!year || !confirm(`Delete all ${year.year} awards and stats?`)) return;
    try {
      await api.deleteYear(year.year);
      onDeleted(year.year);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor wide" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={year ? 'Edit year' : 'Add year'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{year ? `Edit ${year.year} awards` : 'Add a year'}</h2>

        <div className="editor-row">
          <label className="field">
            <span>Year</span>
            <input type="number" required min={1970} max={2100} value={yearNo} onChange={(e) => setYearNo(e.target.value)} />
          </label>
        </div>

        <fieldset className="editor-section">
          <legend>Awards</legend>
          <p className="muted small">Pick a game from the collection, or type any text and leave the platform empty (e.g. a console or a moment).</p>
          <ol className="award-rows">
            {awards.map((a, i) => (
              <li key={i} className="award-row">
                <input className="award-row-category" value={a.category} onChange={(e) => updateAward(i, { category: e.target.value })} placeholder="Category" aria-label="Category" />
                <GamePicker value={a.winner} onChange={(winner) => updateAward(i, { winner })} games={games} link={link} placeholder="Winner" platformOptional />
                <button type="button" className="icon-btn" onClick={() => setAwards((as) => as.filter((_, j) => j !== i))} title="Remove category">
                  ×
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn" onClick={() => setAwards((as) => [...as, { category: '', winner: toPicker(null) }])}>
            + Add category
          </button>
        </fieldset>

        <fieldset className="editor-section">
          <legend>Stats &amp; highlights</legend>
          {months && (
            <button type="button" className="btn" onClick={fillFromGotm} disabled={!yearMonths.length} title="Totals and repeat winners from the Game of the Month tab">
              ↻ Fill from Game of the Month ({yearMonths.length} {yearMonths.length === 1 ? 'month' : 'months'})
            </button>
          )}
          <div className="editor-row">
            <label className="field">
              <span>Games completed</span>
              <input type="number" min={0} value={completed} onChange={(e) => setCompleted(e.target.value)} />
            </label>
            <label className="field">
              <span>Games bought</span>
              <input type="number" min={0} value={bought} onChange={(e) => setBought(e.target.value)} />
            </label>
            <label className="field grow">
              <span>Consoles bought (comma separated)</span>
              <input value={consoles} onChange={(e) => setConsoles(e.target.value)} placeholder="e.g. PS Vita, Atari FlashBack 3" />
            </label>
          </div>

          <div className="field">
            <span>Game of the Month more than once</span>
            <ol className="played-rows">
              {multi.map((m, i) => (
                <li key={i} className="played-row">
                  <GamePicker value={m} onChange={(v) => setMulti((ms) => ms.map((x, j) => (j === i ? v : x)))} games={games} link={link} />
                  <button type="button" className="icon-btn" onClick={() => setMulti((ms) => ms.filter((_, j) => j !== i))} title="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="link" onClick={() => setMulti((ms) => [...ms, { title: '', platform: '' }])}>
              + Add game
            </button>
          </div>

          <div className="field">
            <span>Rating changes</span>
            <ol className="played-rows">
              {changes.map((c, i) => (
                <li key={i} className="change-row">
                  <input value={c.title} placeholder="Game" onChange={(e) => setChanges((cs) => cs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <input type="number" step={0.5} value={c.from} placeholder="From" aria-label="From" onChange={(e) => setChanges((cs) => cs.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                  <span>→</span>
                  <input type="number" step={0.5} value={c.to} placeholder="To" aria-label="To" onChange={(e) => setChanges((cs) => cs.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                  <button type="button" className="icon-btn" onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))} title="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="link" onClick={() => setChanges((cs) => [...cs, { title: '', from: '', to: '' }])}>
              + Add rating change
            </button>
          </div>

          <label className="field">
            <span>Moment of the Year: honourable mentions</span>
            <textarea rows={3} value={mentions} onChange={(e) => setMentions(e.target.value)} />
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {year && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete year
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : year ? 'Save changes' : 'Add year'}
          </button>
        </div>
      </form>
    </div>
  );
}
