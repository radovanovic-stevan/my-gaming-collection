import { useEffect } from 'react';
import type { ChangeGroup, ChangeTab } from '../lib/whatsNew';

const SHOWN_PER_GROUP = 8;

interface Props {
  groups: ChangeGroup[];
  onClose: () => void;
  onOpenItem: (tab: ChangeTab, id: number | string) => void;
}

export function WhatsNew({ groups, onClose, onOpenItem }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal award-editor whats-new" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="whats-new-title">What's new since your last visit</h2>
        {groups.map((group) => {
          const added = group.changes.filter((c) => c.isNew).length;
          const updated = group.changes.length - added;
          const more = group.changes.length - SHOWN_PER_GROUP;
          return (
            <section key={group.tab} className="whats-new-group">
              <h3 className="section-title">
                {group.label}{' '}
                <span className="whats-new-count">{[added && `${added} new`, updated && `${updated} updated`].filter(Boolean).join(' · ')}</span>
              </h3>
              <ul className="whats-new-list">
                {group.changes.slice(0, SHOWN_PER_GROUP).map((change, i) => (
                  <li key={i}>
                    <span className={`whats-new-tag ${change.isNew ? 'is-new' : ''}`}>{change.isNew ? 'New' : 'Updated'}</span>
                    <div>
                      {change.itemId !== undefined ? (
                        <button className="ref-link" onClick={() => (onClose(), onOpenItem(group.tab, change.itemId!))}>
                          <span className="ref-title">{change.title}</span>
                        </button>
                      ) : (
                        <span className="whats-new-title">{change.title}</span>
                      )}
                      {change.details.length > 0 && <p className="muted small">{change.details.join(' · ')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              {more > 0 && <p className="muted small">+{more} more</p>}
            </section>
          );
        })}
        <div className="form-actions">
          <button className="btn primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
