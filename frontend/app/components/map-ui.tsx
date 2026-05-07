import type { DivIcon, LatLngTuple } from 'leaflet';

export const MAP_TILE_URL = 'https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1';
export const MAP_TILE_SUBDOMAINS = '0123';

export const MAP_PROVIDER = {
  name: '2ГИС',
  href: 'https://2gis.ru',
} as const;

const DEFAULT_PIN_COLOR = '#5B4FD9';

const PIN_COLORS = {
  event: '#5B4FD9',
  venue: '#01696f',
  meeting: '#F0637A',
} as const;

export type MapPinTone = keyof typeof PIN_COLORS;

function safeHexColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_PIN_COLOR;
}

export function buildMapPinSvg(color: string, size = 40): string {
  const safeColor = safeHexColor(color);
  const safeSize = Number.isFinite(size) && size > 0 ? size : 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 40 40" aria-hidden="true">
    <filter id="gv-map-pin-shadow" x="-20%" y="-10%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(0,0,0,.28)"/>
    </filter>
    <path filter="url(#gv-map-pin-shadow)" d="M20 2C13.373 2 8 7.373 8 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="${safeColor}" stroke="white" stroke-width="2.4"/>
    <circle cx="20" cy="14" r="4.6" fill="white"/>
  </svg>`;
}

export function createMapPinIcon(
  L: { divIcon: (options: Record<string, unknown>) => DivIcon },
  tone: MapPinTone,
  size = 40
): DivIcon {
  const iconSize = Number.isFinite(size) && size > 0 ? size : 40;
  return L.divIcon({
    html: buildMapPinSvg(PIN_COLORS[tone], iconSize),
    className: 'gv-map-pin',
    iconSize: [iconSize, iconSize] as [number, number],
    iconAnchor: [iconSize / 2, iconSize] as [number, number],
    popupAnchor: [0, -iconSize - 2] as [number, number],
  });
}

export function MapAttribution({ className = '' }: { className?: string }) {
  return (
    <div className={`gv-map-attribution ${className}`.trim()}>
      &copy;{' '}
      <a href={MAP_PROVIDER.href} target="_blank" rel="noopener noreferrer">
        {MAP_PROVIDER.name}
      </a>
    </div>
  );
}

export function buildExternalMapSearchUrl(address: string): string {
  return `${MAP_PROVIDER.href}/search/${encodeURIComponent(address)}`;
}

export function mapShellHeight(isMobile: boolean, desktopHeight: string, mobileHeight: string): string {
  return isMobile ? mobileHeight : desktopHeight;
}

export function formatMapPointLabel(landmark: string | null | undefined, lat: number, lon: number): string {
  const trimmed = landmark?.trim();
  if (trimmed) return trimmed;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function asLatLngTuple(lat: number, lon: number): LatLngTuple {
  return [lat, lon];
}
