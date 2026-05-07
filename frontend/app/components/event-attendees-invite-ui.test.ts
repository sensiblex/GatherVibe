import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EventAttendees invite UI', () => {
  it('contains creator-only invite flow with disabled labels', () => {
    const sourcePath = resolve(process.cwd(), 'app/components/EventAttendees.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).toContain('canManageInvites');
    expect(source).toContain('sendInvite(');
    expect(source).toContain("label: 'Уже приглашен'");
    expect(source).toContain("label: 'В группе'");
    expect(source).toContain('canInvite={canManageInvites}');
  });
});

