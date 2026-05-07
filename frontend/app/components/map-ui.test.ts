import { describe, expect, it } from 'vitest';
import {
  MAP_PROVIDER,
  buildExternalMapSearchUrl,
  buildMapPinSvg,
  formatMapPointLabel,
  mapShellHeight,
} from './map-ui';

describe('map-ui helpers', () => {
  it('keeps provider attribution explicit', () => {
    expect(MAP_PROVIDER.name).toBe('2ГИС');
    expect(MAP_PROVIDER.href).toBe('https://2gis.ru');
  });

  it('builds external search links with encoded address', () => {
    expect(buildExternalMapSearchUrl('Москва, Петровка 2')).toBe(
      'https://2gis.ru/search/%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%2C%20%D0%9F%D0%B5%D1%82%D1%80%D0%BE%D0%B2%D0%BA%D0%B0%202'
    );
  });

  it('falls back to a safe pin color for invalid custom colors', () => {
    const svg = buildMapPinSvg('url(javascript:alert(1))');
    expect(svg).toContain('fill="#5B4FD9"');
    expect(svg).not.toContain('javascript');
  });

  it('formats point label from landmark or coordinates', () => {
    expect(formatMapPointLabel('  у главного входа  ', 55.7558, 37.6173)).toBe('у главного входа');
    expect(formatMapPointLabel('', 55.7558, 37.6173)).toBe('55.7558, 37.6173');
  });

  it('selects stable map shell height for desktop and mobile', () => {
    expect(mapShellHeight(false, '420px', '320px')).toBe('420px');
    expect(mapShellHeight(true, '420px', '320px')).toBe('320px');
  });
});
