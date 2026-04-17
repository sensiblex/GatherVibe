'use client';

import type { PriceMode } from './event-filters';

const OPTIONS: { value: PriceMode; label: string }[] = [
  { value: 'all',  label: 'Все' },
  { value: 'free', label: 'Бесплатно' },
  { value: 'paid', label: 'Платные' },
];

interface Props {
  value: PriceMode;
  onChange: (v: PriceMode) => void;
}

export default function PriceToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Фильтр по цене"
      style={{
        display: 'inline-flex',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-full)',
        padding: 3,
        gap: 2,
      }}
    >
      {OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="whitespace-nowrap font-semibold transition"
            style={{
              padding: '0.4rem 0.95rem',
              borderRadius: 'var(--r-full)',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: 'none',
              fontSize: '.8125rem',
              cursor: 'pointer',
              boxShadow: active ? '0 2px 8px var(--primary-ring)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
