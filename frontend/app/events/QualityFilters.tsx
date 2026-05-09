'use client';

import type { PermanenceMode } from './event-filters';

interface Props {
  permanence: PermanenceMode;
  onChange: (patch: { permanence?: PermanenceMode }) => void;
}

function chip(on: boolean) {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--r-full)',
    fontSize: '.8125rem',
    background: on ? 'var(--primary)' : 'var(--surface-2)',
    color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
    border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
  } as const;
}

export default function QualityFilters({ permanence, onChange }: Props) {
  const togglePerm = (mode: PermanenceMode) =>
    onChange({ permanence: permanence === mode ? 'all' : mode });

  return (
    <div className="flex flex-wrap gap-2" aria-label="Тип события">
      <button aria-pressed={permanence === 'only'} onClick={() => togglePerm('only')} style={chip(permanence === 'only')}>
        Только постоянные
      </button>
      <button aria-pressed={permanence === 'exclude'} onClick={() => togglePerm('exclude')} style={chip(permanence === 'exclude')}>
        Только разовые
      </button>
    </div>
  );
}
