import { describe, expect, it } from 'vitest';
import {
  buildEventIdentityMeta,
  formatEventIdentityDateLabel,
  resolveEventIdentityTitle,
} from './event-identity';

describe('event identity helpers', () => {
  it('uses event title when present', () => {
    expect(resolveEventIdentityTitle('  ночной концерт  ', '123')).toBe('Ночной концерт');
  });

  it('falls back to event id when title is empty', () => {
    expect(resolveEventIdentityTitle('   ', '204669')).toBe('Событие #204669');
  });

  it('returns null date label when event timestamp is absent', () => {
    expect(formatEventIdentityDateLabel(null)).toBeNull();
    expect(formatEventIdentityDateLabel(undefined)).toBeNull();
  });

  it('formats valid unix timestamp', () => {
    const label = formatEventIdentityDateLabel(1767225600); // 2026-01-01T00:00:00Z
    expect(label).toBeTruthy();
    expect(label).toContain('2026');
  });

  it('builds complete meta object for event identity UI', () => {
    const meta = buildEventIdentityMeta({
      eventId: '555',
      eventTitle: 'Лекция',
      eventDateTs: 1767225600,
    });
    expect(meta.title).toBe('Лекция');
    expect(meta.href).toBe('/events/555');
    expect(meta.dateLabel).toBeTruthy();
  });
});

