import { useEffect } from 'react';

export function Rules({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal award-editor rules" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="rules-title">The rules of my collection</h2>
        <ul className="rules-list">
          <li>The ratings are my own.</li>
          <li>All the data is my own.</li>
          <li>
            If a cartridge or disc contains multiple games that I deem big enough to rate and keep track of separately, each one is its own entry.
            Otherwise, it's one entry that lists which games are included.
          </li>
        </ul>
        <div className="form-actions">
          <button className="btn primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
