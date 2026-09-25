import type { SortKey, SortLevel } from '../types';
import { SORT_LABELS } from '../lib/query';

interface Props {
  sort: SortLevel[];
  onChange: (sort: SortLevel[]) => void;
}

const KEYS = Object.keys(SORT_LABELS) as SortKey[];

export function SortBuilder({ sort, onChange }: Props) {
  const update = (i: number, patch: Partial<SortLevel>) => onChange(sort.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(sort.filter((_, j) => j !== i));
  const move = (i: number, delta: number) => {
    const next = [...sort];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onChange(next);
  };
  const unused = KEYS.filter((k) => !sort.some((s) => s.key === k));

  return (
    <div className="sort-builder">
      {sort.map((s, i) => (
        <div className="sort-level" key={s.key}>
          <span className="sort-level-label">{i === 0 ? 'Sort by' : 'then'}</span>
          <select value={s.key} onChange={(e) => update(i, { key: e.target.value as SortKey })} aria-label={`Sort level ${i + 1}`}>
            {[s.key, ...unused].map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            onClick={() => update(i, { dir: s.dir === 'asc' ? 'desc' : 'asc' })}
            title={s.dir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {s.dir === 'asc' ? '↑' : '↓'}
          </button>
          <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
            ⌃
          </button>
          <button className="icon-btn" disabled={i === sort.length - 1} onClick={() => move(i, 1)} title="Move down">
            ⌄
          </button>
          <button className="icon-btn" disabled={sort.length === 1} onClick={() => remove(i)} title="Remove">
            ×
          </button>
        </div>
      ))}
      {unused.length > 0 && (
        <button className="link" onClick={() => onChange([...sort, { key: unused[0], dir: 'asc' }])}>
          + Add sort level
        </button>
      )}
    </div>
  );
}
