'use client';

import { KUDAGO_CITIES, type CitySlug } from './event-filters';

interface Props {
  value: CitySlug;
  onChange: (slug: CitySlug) => void;
}

export default function CityFilter({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as CitySlug)}
      className="input"
      style={{ width: 'auto', padding: '.5rem 1.125rem', fontSize: '.8125rem', fontWeight: 600 }}
      aria-label="Выбор города"
    >
      {KUDAGO_CITIES.map(c => (
        <option key={c.slug} value={c.slug}>{c.name}</option>
      ))}
    </select>
  );
}
