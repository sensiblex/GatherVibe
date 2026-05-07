import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EventChat status UI removal', () => {
  it('does not render connection status labels in header', () => {
    const sourcePath = resolve(process.cwd(), 'app/components/EventChat.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).not.toContain('Подключено');
    expect(source).not.toContain('Подключение...');
    expect(source).not.toMatch(/connected\s*\?\s*['"`].+['"`]\s*:\s*['"`].+['"`]/u);
  });
});
