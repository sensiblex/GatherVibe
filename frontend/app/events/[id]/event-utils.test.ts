import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  normaliseKudago,
  formatShortDate,
  formatAge,
  safeEventTimestamp,
} from './event-utils';

// ---------------------------------------------------------------------------
// stripHtml — HTML entity decoding (FAILING: entities are not decoded yet)
// ---------------------------------------------------------------------------
describe('stripHtml — HTML entities', () => {
  it('декодирует &nbsp; в пробел', () => {
    expect(stripHtml('hello&nbsp;world')).toBe('hello world');
  });

  it('декодирует &amp;', () => {
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('декодирует &quot;', () => {
    expect(stripHtml('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('декодирует &#160; внутри текста', () => {
    expect(stripHtml('hello&#160;world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// formatShortDate — new function, stub returns '' (FAILING)
// ---------------------------------------------------------------------------
describe('formatShortDate', () => {
  it('форматирует дату без времени', () => {
    expect(formatShortDate('2026-05-14')).toBe('14 мая 2026');
  });

  it('форматирует дату со временем', () => {
    expect(formatShortDate('2026-05-14', '19:00')).toBe('14 мая 2026 в 19:00');
  });

  it('форматирует январь', () => {
    expect(formatShortDate('2026-01-03')).toBe('3 января 2026');
  });
});

// ---------------------------------------------------------------------------
// formatAge — new function, stub returns '' (FAILING)
// ---------------------------------------------------------------------------
describe('formatAge', () => {
  it('не дублирует плюс если уже есть', () => {
    expect(formatAge('6+')).toBe('6+');
  });

  it('добавляет плюс если нет', () => {
    expect(formatAge('6')).toBe('6+');
  });

  it('обрабатывает 0+', () => {
    expect(formatAge('0+')).toBe('0+');
  });

  it('trim + корректный плюс', () => {
    expect(formatAge(' 12 ')).toBe('12+');
  });
});

// ---------------------------------------------------------------------------
// safeEventTimestamp — new function, stub returns null (FAILING)
// ---------------------------------------------------------------------------
describe('safeEventTimestamp', () => {
  it('корректный timestamp для даты без времени', () => {
    const ts = safeEventTimestamp('2026-05-14');
    expect(ts).not.toBeNull();
    expect(ts).toBeGreaterThan(0);
  });

  it('корректный timestamp для HH:MM', () => {
    const ts = safeEventTimestamp('2026-05-14', '19:00');
    expect(ts).not.toBeNull();
    expect(isNaN(ts!)).toBe(false);
  });

  it('корректный timestamp для HH:MM:SS (не NaN)', () => {
    const ts = safeEventTimestamp('2026-05-14', '19:00:00');
    expect(ts).not.toBeNull();
    expect(isNaN(ts!)).toBe(false);
  });

  it('null при невалидной дате', () => {
    const ts = safeEventTimestamp('invalid-date');
    expect(ts).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normaliseKudago — place_schedules (FAILING: stub ignores data.place_schedules)
// ---------------------------------------------------------------------------
describe('normaliseKudago — place_schedules', () => {
  it('place_schedules пустой если бэкенд не вернул данные', () => {
    const event = normaliseKudago({ id: 1, title: 'Test' });
    expect(event.place_schedules).toEqual([]);
  });

  it('place_schedules парсится из data.place_schedules если есть', () => {
    const schedules = [{ weekday: 1, from: '10:00', to: '18:00' }];
    const event = normaliseKudago({ id: 1, title: 'Test', place_schedules: schedules });
    expect(event.place_schedules).toEqual(schedules);
  });
});
