import { useEffect, useMemo, useState } from 'react';
import type { ConsoleModel, Game, GameConsole } from '../types';
import { api } from '../lib/api';
import { imageUrl } from '../lib/format';

interface Props {
  /** Console to edit, or null to add one. */
  item: GameConsole | null;
  /** All consoles, for the maker suggestions. */
  consoles: GameConsole[];
  games: Game[];
  onSaved: (item: GameConsole) => void;
  onClose: () => void;
}

export function ConsoleForm({ item, consoles, games, onSaved, onClose }: Props) {
  const [name, setName] = useState(item?.name ?? '');
  const [maker, setMaker] = useState(item?.maker ?? '');
  const [platform, setPlatform] = useState(item?.platform ?? '');
  const [acquired, setAcquired] = useState(item?.acquired ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [models, setModels] = useState<ConsoleModel[]>(item?.models ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makers = useMemo(() => [...new Set(consoles.map((r) => r.maker).filter(Boolean))].sort(), [consoles]);
  const platforms = useMemo(() => [...new Set(games.map((g) => g.platform))].sort(), [games]);
  const images = item?.images ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateModel = (i: number, patch: Partial<ConsoleModel>) => setModels((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = { name, maker, platform: platform || null, acquired: acquired || null, notes, models: models.filter((m) => m.name.trim()) };
      onSaved(item ? await api.updateConsole(item.id, input) : await api.addConsole(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor wide" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={item ? 'Edit console' : 'Add console'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{item ? 'Edit console' : 'Add a console'}</h2>
        <div className="editor-row">
          <label className="field grow">
            <span>Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Maker</span>
            <input value={maker} onChange={(e) => setMaker(e.target.value)} list="console-makers" />
            <datalist id="console-makers">
              {makers.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="editor-row">
          <label className="field grow">
            <span>Platform in the collection</span>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} list="console-platforms" placeholder="e.g. PS2" />
            <datalist id="console-platforms">
              {platforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field grow">
            <span>Acquired</span>
            <input value={acquired} onChange={(e) => setAcquired(e.target.value)} placeholder="2024-05-12, or Christmas 2010" />
          </label>
        </div>

        <fieldset className="editor-section">
          <legend>Models</legend>
          <p className="muted small">
            The models you own, like “Slim (Silver)”. Leave empty when there's nothing to tell apart.
            {images.length > 0 ? ' Pick the picture that shows each one.' : item ? '' : ' Pictures can be picked once the console has some.'}
          </p>
          {models.length > 0 && (
            <ol className="model-rows">
              {models.map((m, i) => (
                <li key={i} className="model-row">
                  <input value={m.name} onChange={(e) => updateModel(i, { name: e.target.value })} placeholder="e.g. DS Lite (Silver)" aria-label={`Model ${i + 1}`} />
                  {images.length > 0 && (
                    <div className="model-pictures" role="radiogroup" aria-label={`Picture of model ${i + 1}`}>
                      {images.map((file) => (
                        <button
                          key={file}
                          type="button"
                          role="radio"
                          aria-checked={m.image === file}
                          className={m.image === file ? 'on' : ''}
                          onClick={() => updateModel(i, { image: m.image === file ? null : file })}
                          title={m.image === file ? 'Click again to unset' : 'Use this picture'}
                        >
                          <img src={imageUrl(file)} alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className="icon-btn" onClick={() => setModels((ms) => ms.filter((_, j) => j !== i))} title="Remove this model">
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="btn" onClick={() => setModels((ms) => [...ms, { name: '', image: null }])}>
            + Add model
          </button>
        </fieldset>

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where it came from, mods, condition…" />
        </label>
        {!item && <p className="muted small">Next you can add pictures. The first one becomes the cover.</p>}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add console'}
          </button>
        </div>
      </form>
    </div>
  );
}
