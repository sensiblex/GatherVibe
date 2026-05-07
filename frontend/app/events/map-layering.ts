export const MAP_STACKING_Z_INDEX = 0;
export const LEAFLET_MAX_PANE_Z_INDEX = 700;
export const FILTER_OVERLAY_Z_INDEX = 900;
export const FILTER_DRAWER_Z_INDEX = 910;

export const MAP_STACKING_CONTEXT_STYLE = {
  position: 'relative',
  zIndex: MAP_STACKING_Z_INDEX,
  isolation: 'isolate',
} as const;
