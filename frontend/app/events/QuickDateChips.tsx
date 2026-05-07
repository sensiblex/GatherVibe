'use client';

import type { QuickDate } from './event-filters';

const CHIPS: { value: QuickDate; label: string }[] = [
  { value: 'today',    label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
  { value: 'weekend',  label: 'Выходные' },
  { value: 'week',     label: 'Неделя' },
  { value: 'month',    label: 'Месяц' },
];

interface Props {
  active: QuickDate | null;
  onSelect: (v: QuickDate | null) => void;
}

export default function QuickDateChips({ active, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Быстрые даты">
      {CHIPS.map(c => {
        const on = c.value === active;
        return (
          <button
            key={c.value}
            onClick={() => onSelect(on ? null : c.value)}
            aria-pressed={on}
            className="whitespace-nowrap font-semibold transition"
            style={{
              padding: '0.4rem 0.95rem',
              borderRadius: 'var(--r-full)',
              fontSize: '.8125rem',
              background: on ? 'var(--primary)' : 'var(--surface-2)',
              color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
              cursor: 'pointer',
              boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
