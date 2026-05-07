import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VIEWED_EVENTS_STORAGE_KEY,
  markEventViewed,
  readViewedEventIds,
} from './viewed-events';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('window', { localStorage: localStorageMock });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('viewed events localStorage helpers', () => {
  it('returns an empty list when localStorage is empty', () => {
    expect(readViewedEventIds()).toEqual([]);
  });

  it('returns an empty list for broken JSON', () => {
    localStorageMock.setItem(VIEWED_EVENTS_STORAGE_KEY, '{broken');

    expect(readViewedEventIds()).toEqual([]);
  });

  it('normalizes ids and removes duplicates', () => {
    localStorageMock.setItem(
      VIEWED_EVENTS_STORAGE_KEY,
      JSON.stringify([42, '42', ' 17 ', '', null, '17']),
    );

    expect(readViewedEventIds()).toEqual(['42', '17']);
  });

  it('marks an event as viewed without duplicating ids', () => {
    expect(markEventViewed(42)).toEqual(['42']);
    expect(markEventViewed('42')).toEqual(['42']);
    expect(JSON.parse(localStorageMock.getItem(VIEWED_EVENTS_STORAGE_KEY) || '[]')).toEqual(['42']);
  });

  it('does not throw when localStorage write fails', () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => markEventViewed('99')).not.toThrow();
  });
});
