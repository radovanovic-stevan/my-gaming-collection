import { useMemo, useState } from 'react';
import type { Game, Query } from '../types';
import { STATUSES } from '../types';
import { facet } from '../lib/query';
import { genreLabel } from '../lib/format';

interface Props {
  games: Game[];
  query: Query;
  onChange: (patch: Partial<Query>) => void;
  onReset: () => void;
}

type ListKey = 'platforms' | 'statuses' | 'genres' | 'conditions';

function FacetGroup({
  title,
  items,
  selected,
  onToggle,
  label = (v) => v,
  collapsedCount = 8,
}: {
  title: string;
  items: [string, number][];
  selected: string[];
  onToggle: (value: string) => void;
  label?: (v: string) => string;
  collapsedCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, collapsedCount);
  // Keep selected values visible even when the group is collapsed.
  const hiddenSelected = expanded ? [] : items.slice(collapsedCount).filter(([v]) => selected.includes(v));

  return (
    <fieldset className="facet">
      <legend>{title}</legend>
      <div className="chips">
        {[...visible, ...hiddenSelected].map(([value, count]) => (
          <button
            key={value}
            className={`chip ${selected.includes(value) ? 'on' : ''}`}
            aria-pressed={selected.includes(value)}
            onClick={() => onToggle(value)}
          >
            {label(value)} <span className="chip-count">{count}</span>
          </button>
        ))}
      </div>
      {items.length > collapsedCount && (
        <button className="link" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </fieldset>
  );
}

export function Filters({ games, query, onChange, onReset }: Props) {
  const facets = useMemo(
    () => ({
      platforms: facet(games, (g) => [g.platform]),
      statuses: facet(games, (g) => [g.status]).sort((a, b) => STATUSES.indexOf(a[0] as never) - STATUSES.indexOf(b[0] as never)),
      genres: facet(games, (g) => g.genres),
      conditions: facet(games, (g) => g.condition),
    }),
    [games],
  );

  const toggle = (key: ListKey) => (value: string) => {
    const cur = query[key];
    onChange({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const parseRating = (v: string) => (v === '' ? null : Number(v));

  return (
    <aside className="filters">
      <div className="filters-head">
        <h2>Filters</h2>
        <button className="link" onClick={onReset}>
          Reset all
        </button>
      </div>

      <FacetGroup title="Status" items={facets.statuses} selected={query.statuses} onToggle={toggle('statuses')} />
      <FacetGroup title="Platform" items={facets.platforms} selected={query.platforms} onToggle={toggle('platforms')} collapsedCount={10} />
      <FacetGroup title="Genre (match all)" items={facets.genres} selected={query.genres} onToggle={toggle('genres')} label={genreLabel} collapsedCount={12} />
      <FacetGroup title="Condition" items={facets.conditions} selected={query.conditions} onToggle={toggle('conditions')} />

      <fieldset className="facet">
        <legend>Rating</legend>
        <div className="range">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            placeholder="Min"
            value={query.ratingMin ?? ''}
            onChange={(e) => onChange({ ratingMin: parseRating(e.target.value) })}
            aria-label="Minimum rating"
          />
          <span>–</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            placeholder="Max"
            value={query.ratingMax ?? ''}
            onChange={(e) => onChange({ ratingMax: parseRating(e.target.value) })}
            aria-label="Maximum rating"
          />
        </div>
      </fieldset>

      <fieldset className="facet">
        <legend>Cover art</legend>
        <div className="segmented">
          {(['any', 'with', 'without'] as const).map((v) => (
            <button key={v} className={query.cover === v ? 'on' : ''} onClick={() => onChange({ cover: v })}>
              {v === 'any' ? 'Any' : v === 'with' ? 'Has cover' : 'Missing'}
            </button>
          ))}
        </div>
      </fieldset>
    </aside>
  );
}
