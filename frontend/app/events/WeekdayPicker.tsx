'use client';

import { WEEKDAYS, toggleWeekday } from './event-filters';

interface Props {
  selected: number[];
  onChange: (next: number[]) => void;
}

export default function WeekdayPicker({ selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="День недели">
      {WEEKDAYS.map(d => {
        const on = selected.includes(d.value);
        return (
          <button
            key={d.value}
            title={d.long}
            aria-pressed={on}
            aria-label={d.long}
            onClick={() => onChange(toggleWeekday(selected, d.value))}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              fontWeight: 700,
              fontSize: '.8125rem',
              background: on ? 'var(--primary)' : 'var(--surface-2)',
              color: on ? 'var(--text-inverse)' : (d.isWeekend ? '#ef4444' : 'var(--text-muted)'),
              border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'transform 160ms ease, background 160ms ease',
              boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
              transform: on ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}
