'use client';

import { AGE_OPTIONS } from './event-filters';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function AgeFilter({ value, onChange }: Props) {
  return (
    <select
      value={value === null ? '' : String(value)}
      onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
      className="input"
      style={{ width: 'auto', padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600 }}
      aria-label="Фильтр по возрасту"
    >
      {AGE_OPTIONS.map(opt => (
        <option key={String(opt.value)} value={opt.value === null ? '' : String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
