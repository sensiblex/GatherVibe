'use client';

import { KUDAGO_CITIES, type CitySlug } from './event-filters';
import { useEffect, useRef } from 'react';

interface Props {
  value: CitySlug;
  onChange: (slug: CitySlug) => void;
}

export default function CityFilter({ value, onChange }: Props) {
  const selectedCity = KUDAGO_CITIES.find(c => c.slug === value);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (checkboxRef.current) {
          checkboxRef.current.checked = false;
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownId = `city-dropdown-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="dropdown" ref={dropdownRef}>
      <input type="checkbox" id={dropdownId} ref={checkboxRef} />
      <label htmlFor={dropdownId} className="dropdown-btn" style={{ padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600 }} aria-label="Выбор города">
        <span>{selectedCity?.name || 'Город'}</span>
        <span className="arrow"></span>
      </label>

      <ul className="dropdown-content" role="menu">
        {KUDAGO_CITIES.map(c => (
          <li key={c.slug}>
            <button
              type="button"
              onClick={() => {
                onChange(c.slug);
                if (checkboxRef.current) checkboxRef.current.checked = false;
              }}
              role="menuitem"
              style={{ padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600 }}
            >
              {c.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
