import { describe, expect, it } from 'vitest';
import {
  FILTER_DRAWER_Z_INDEX,
  FILTER_OVERLAY_Z_INDEX,
  LEAFLET_MAX_PANE_Z_INDEX,
  MAP_STACKING_CONTEXT_STYLE,
  MAP_STACKING_Z_INDEX,
} from './map-layering';

describe('map layering', () => {
  it('keeps Leaflet panes inside the map stacking context below page overlays', () => {
    expect(MAP_STACKING_Z_INDEX).toBeLessThan(FILTER_OVERLAY_Z_INDEX);
    expect(LEAFLET_MAX_PANE_Z_INDEX).toBeLessThan(FILTER_OVERLAY_Z_INDEX);
    expect(FILTER_OVERLAY_Z_INDEX).toBeLessThan(FILTER_DRAWER_Z_INDEX);
  });

  it('creates an isolated stacking context for embedded maps', () => {
    expect(MAP_STACKING_CONTEXT_STYLE).toMatchObject({
      position: 'relative',
      zIndex: MAP_STACKING_Z_INDEX,
      isolation: 'isolate',
    });
  });
});
