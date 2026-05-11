import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Profile page layout', () => {
  it('keeps only two bottom tabs and inlines reviews/settings actions into main column', () => {
    const sourcePath = resolve(process.cwd(), 'app/profile/page.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).toContain("useState<'parties' | 'events'>('parties')");
    expect(source).not.toContain("useState<'info' | 'parties' | 'events'>('info')");

    expect(source).toContain("{(['parties', 'events'] as const).map(tab => (");
    expect(source).not.toContain("{(['info', 'parties', 'events'] as const).map(tab => (");

    expect(source).not.toContain('<aside>');
    expect(source).not.toContain('<div className="p-card-title">Настройки</div>');

    expect(source).toContain('<div className="profile-about-inline">');
    expect(source).toContain('<div className="profile-about-title">О себе</div>');
    expect(source).toContain('<div className="p-card-title">Отзывы</div>');
    expect(source).toContain('Сменить пароль');
    expect(source).toContain('Приватность');
  });
});

