'use client';

import type { TimeOfDay } from './event-filters';

const OPTS: { value: TimeOfDay; label: string; emoji: string }[] = [
  { value: 'morning', label: 'Утро',   emoji: '🌅' },
  { value: 'day',     label: 'День',   emoji: '☀️' },
  { value: 'evening', label: 'Вечер',  emoji: '🌇' },
  { value: 'night',   label: 'Ночь',   emoji: '🌙' },
];

interface Props {
  value: TimeOfDay | null;
  onChange: (v: TimeOfDay | null) => void;
}

export default function TimeOfDayFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Время суток">
      {OPTS.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(on ? null : o.value)}
            aria-pressed={on}
            className="whitespace-nowrap font-semibold transition"
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--r-full)',
              fontSize: '.75rem',
              background: on ? 'var(--primary)' : 'var(--surface-2)',
              color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
              cursor: 'pointer',
              boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: '.9rem' }}>{o.emoji}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
