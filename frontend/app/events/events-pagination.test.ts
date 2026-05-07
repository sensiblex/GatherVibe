import { describe, expect, it } from 'vitest';

import { hasMoreEvents, mergeEventPages } from './events-pagination';
import { KudaGoEvent } from '../components/EventCard';

function e(id: number): KudaGoEvent {
  return { kudago_id: id, title: `Event ${id}` } as KudaGoEvent;
}

describe('mergeEventPages', () => {
  it('appends new unique events preserving order', () => {
    const merged = mergeEventPages([e(1), e(2)], [e(3), e(4)]);
    expect(merged.map((x) => x.kudago_id)).toEqual([1, 2, 3, 4]);
  });

  it('deduplicates by kudago_id when next page overlaps', () => {
    const merged = mergeEventPages([e(1), e(2)], [e(2), e(3)]);
    expect(merged.map((x) => x.kudago_id)).toEqual([1, 2, 3]);
  });
});

describe('hasMoreEvents', () => {
  it('is true when loaded less than total', () => {
    expect(hasMoreEvents(60, 195)).toBe(true);
  });

  it('is false when loaded equals total', () => {
    expect(hasMoreEvents(195, 195)).toBe(false);
  });

  it('is false when total unknown', () => {
    expect(hasMoreEvents(60, null)).toBe(false);
  });
});

