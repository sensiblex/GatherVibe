import { describe, expect, it } from 'vitest';
import {
  POPULAR_PARTY_CITIES,
  buildPartiesSearchQuery,
  buildPartiesUrlQuery,
  countActivePartyFilters,
  togglePartyCity,
} from './parties-filters';

describe('POPULAR_PARTY_CITIES', () => {
  it('contains the checkbox city options for the parties page', () => {
    expect(POPULAR_PARTY_CITIES).toEqual([
      'Москва',
      'Санкт-Петербург',
      'Казань',
      'Екатеринбург',
      'Нижний Новгород',
    ]);
  });
});

describe('togglePartyCity', () => {
  it('adds and removes cities without dropping other selections', () => {
    expect(togglePartyCity(['Москва'], 'Казань')).toEqual(['Москва', 'Казань']);
    expect(togglePartyCity(['Москва', 'Казань'], 'Москва')).toEqual(['Казань']);
  });
});

describe('buildPartiesSearchQuery', () => {
  it('sends every selected city as a separate city parameter', () => {
    const params = new URLSearchParams(buildPartiesSearchQuery({
      search: '  концерт  ',
      cities: ['Москва', 'Казань'],
      sortBy: 'popular',
      onlyOpen: true,
    }));

    expect(params.get('q')).toBe('концерт');
    expect(params.getAll('city')).toEqual(['Москва', 'Казань']);
    expect(params.get('sort_by')).toBe('popular');
    expect(params.get('is_open')).toBe('true');
  });

  it('normalizes date values for the API while keeping pagination defaults', () => {
    const params = new URLSearchParams(buildPartiesSearchQuery({
      dateFrom: '2026-05-11',
      dateTo: '2026-05-12',
    }));

    expect(params.get('page')).toBe('1');
    expect(params.get('per_page')).toBe('20');
    expect(params.get('date_from')).toBe('2026-05-11T00:00:00');
    expect(params.get('date_to')).toBe('2026-05-12T23:59:59');
  });
});

describe('buildPartiesUrlQuery', () => {
  it('keeps selected cities in the URL without API date suffixes', () => {
    const params = new URLSearchParams(buildPartiesUrlQuery({
      cities: ['Москва', 'Казань'],
      dateFrom: '2026-05-11',
      dateTo: '2026-05-12',
      sortBy: 'date',
    }));

    expect(params.getAll('city')).toEqual(['Москва', 'Казань']);
    expect(params.get('date_from')).toBe('2026-05-11');
    expect(params.get('date_to')).toBe('2026-05-12');
    expect(params.get('sort_by')).toBe('date');
  });
});

describe('countActivePartyFilters', () => {
  it('counts city multi-select as one active filter group', () => {
    expect(countActivePartyFilters({ cities: ['Москва', 'Казань'], onlyOpen: true })).toBe(2);
  });
});
