'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCityAutocomplete, CityOption } from '../lib/useCityAutocomplete';

interface CityAutocompleteProps {
  value: string;
  onChange: (city: string, isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  error?: string;
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder = 'Начните вводить город...',
  required = false,
  disabled = false,
  label,
  error: externalError,
}: CityAutocompleteProps) {
  const {
    query,
    setQuery,
    suggestions,
    loading,
    error: apiError,
    selectedCity,
    setSelectedCity,
  } = useCityAutocomplete();

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  const showError = touched && !selectedCity && query.length > 0 && !loading;
  const errorMessage = externalError || (showError ? 'Выберите город из списка' : apiError);

  useEffect(() => {
    if (value && value !== query) {
      setQuery(value);
    }
  }, [value, setQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setIsOpen(newValue.length >= 2);
    setHighlightedIndex(-1);
    onChange(newValue, false);
  };

  const selectCity = useCallback((city: CityOption) => {
    isSelectingRef.current = true;
    setSelectedCity(city);
    setIsOpen(false);
    setTouched(true);
    onChange(city.city, true);
    // Сбрасываем флаг после того как обработаем blur
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 350);
  }, [setSelectedCity, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          selectCity(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleBlur = () => {
    setTouched(true);
    setTimeout(() => {
      // Не очищаем, если пользователь выбрал город из списка
      if (isSelectingRef.current) return;
      if (!selectedCity && query.length > 0) {
        onChange('', false);
        setQuery('');
      }
      setIsOpen(false);
    }, 300);
  };

  const handleFocus = () => {
    if (query.length >= 2 && !selectedCity) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
          {label}
          {required && <span style={{ color: 'var(--error)' }}>*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{
            background: 'var(--surface-2)',
            border: `1px solid ${errorMessage ? 'var(--error)' : 'var(--border)'}`,
            color: 'var(--text)',
          }}
          aria-autocomplete="list"
          aria-controls={isOpen ? 'city-suggestions' : undefined}
          aria-expanded={isOpen}
          aria-activedescendant={highlightedIndex >= 0 ? `city-option-${highlightedIndex}` : undefined}
        />
        
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        
        {selectedCity && !loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">
            ✓
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>
          {errorMessage}
        </p>
      )}

      {isOpen && suggestions.length > 0 && (
        <ul
          id="city-suggestions"
          role="listbox"
          className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg max-h-60 overflow-y-auto"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {suggestions.map((city, index) => (
            <li
              key={`${city.city}-${index}`}
              id={`city-option-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // Предотвращаем blur на input
                selectCity(city);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className="px-4 py-2.5 text-sm cursor-pointer transition-colors"
              style={{
                background: index === highlightedIndex ? 'var(--primary-hl)' : 'var(--surface)',
                color: index === highlightedIndex ? 'var(--primary)' : 'var(--text)',
                borderBottom: index < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="font-medium">{city.city}</div>
              {city.region && city.region !== city.city && (
                <div className="text-xs opacity-70">{city.region}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && !loading && query.length >= 2 && suggestions.length === 0 && !apiError && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          Город не найден
        </div>
      )}
    </div>
  );
}
