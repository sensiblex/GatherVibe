import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('MyEvents review completion behavior', () => {
  it('keeps event cards and only removes review CTA state for completed event', () => {
    const sourcePath = resolve(process.cwd(), 'app/my-events/page.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).toContain('function clearReviewableForEvent(eventId: string)');
    expect(source).toContain('const completedEventId = reviewingEventId;');
    expect(source).toContain('if (completedEventId) clearReviewableForEvent(completedEventId);');
    expect(source).not.toContain('refreshReviewable();');
  });
});
