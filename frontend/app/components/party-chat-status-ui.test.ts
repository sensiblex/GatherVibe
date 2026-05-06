import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PartyChat status UI removal', () => {
  it('does not render connection indicator block above messages', () => {
    const sourcePath = resolve(process.cwd(), 'app/components/PartyChat.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).not.toContain('онлайн');
    expect(source).not.toContain('соединение...');
    expect(source).not.toContain('justify-end gap-1.5 px-4 py-2');
  });
});
