'use client';

import { AGE_OPTIONS } from './event-filters';
import { useEffect, useRef } from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export default function AgeFilter({ value, onChange }: Props) {
  const selectedOption = AGE_OPTIONS.find(opt => opt.value === value);
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

  const dropdownId = `age-dropdown-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="dropdown" ref={dropdownRef}>
      <input type="checkbox" id={dropdownId} ref={checkboxRef} />
      <label htmlFor={dropdownId} className="dropdown-btn" style={{ padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600 }} aria-label="Фильтр по возрасту">
        <span>{selectedOption?.label || 'Возраст'}</span>
        <span className="arrow"></span>
      </label>

      <ul className="dropdown-content" role="menu">
        {AGE_OPTIONS.map(opt => (
          <li key={String(opt.value)}>
            <button
              type="button"
              onClick={() => {
                onChange(opt.value);
                if (checkboxRef.current) checkboxRef.current.checked = false;
              }}
              role="menuitem"
              style={{ padding: '.5rem 1rem', fontSize: '.8125rem', fontWeight: 600 }}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
