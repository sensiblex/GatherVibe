import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('UserReviewsBlock header rendering', () => {
  it('does not render an internal "Отзывы" heading to avoid duplicate title in profile widget', () => {
    const sourcePath = resolve(process.cwd(), 'app/components/UserReviewsBlock.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).not.toMatch(/<h2[^>]*>[\s\S]*?Отзывы[\s\S]*?<\/h2>/u);
  });
});
