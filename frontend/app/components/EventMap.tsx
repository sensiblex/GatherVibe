'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLngTuple } from 'leaflet';
import { MAP_STACKING_CONTEXT_STYLE } from '../events/map-layering';
import {
  MAP_TILE_SUBDOMAINS,
  MAP_TILE_URL,
  MapAttribution,
  buildExternalMapSearchUrl,
  createMapPinIcon,
} from './map-ui';

interface EventMapProps {
  address: string;
  title?: string;
  height?: string;
  className?: string;
  lat?: number | null;
  lon?: number | null;
}

interface TwoGisPoint {
  lat: number;
  lon: number;
}

interface TwoGisItem {
  point?: TwoGisPoint;
}

interface TwoGisResponse {
  result?: {
    items?: TwoGisItem[];
  };
}

type GeoState = 'idle' | 'loading' | 'found' | 'notfound' | 'error' | 'limit';

const VIRTUAL_KEYWORDS = ['онлайн', 'online', 'tbd', 'уточняется', 'zoom', 'discord'];

function isVirtualAddress(addr: string): boolean {
  return VIRTUAL_KEYWORDS.some(k => addr.toLowerCase().includes(k));
}

// ── Inner map (SSR-unsafe, loaded only client-side) ───────────────────────────

interface MapInnerProps {
  coords: LatLngTuple;
  title: string;
  address: string;
  height: string;
}

function MapInnerComponent({ coords, title, address, height }: MapInnerProps) {
  const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');
  const L = require('leaflet');

  const customIcon = createMapPinIcon(L, 'venue', 40);

  return (
    <MapContainer
      center={coords}
      zoom={15}
      scrollWheelZoom={false}
      attributionControl={false}
      style={{ height, width: '100%' }}
    >
      <TileLayer
        url={MAP_TILE_URL}
        subdomains={MAP_TILE_SUBDOMAINS}
      />
      <Marker position={coords} icon={customIcon}>
        <Popup className="gv-map-popup">
          <div className="gv-map-popup-content">
            {title && <strong>{title}</strong>}
            {address && <span>{address}</span>}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}

const MapInner = dynamic(
  () => Promise.resolve(MapInnerComponent),
  { ssr: false }
);

// ── Public component ──────────────────────────────────────────────────────────

export default function EventMap({
  address,
  title = '',
  height = '220px',
  className = '',
  lat = null,
  lon = null,
}: EventMapProps) {
  const hasCoords = lat != null && lon != null;
  const [geoState, setGeoState] = useState<GeoState>(hasCoords ? 'found' : 'idle');
  const [coords, setCoords] = useState<LatLngTuple | null>(
    hasCoords ? [lat as number, lon as number] : null
  );
  const [mapExpanded, setMapExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (hasCoords || !address || isVirtualAddress(address)) return;

    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();
          geocode();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [address, hasCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  async function geocode() {
    setGeoState('loading');

    const cacheKey = `geo_2gis_${address}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { lat, lon } = JSON.parse(cached) as { lat: number; lon: number };
        setCoords([lat, lon]);
        setGeoState('found');
        return;
      }
    } catch {
      // sessionStorage unavailable — proceed with network request
    }

    const apiKey = process.env.NEXT_PUBLIC_2GIS_KEY;
    if (!apiKey) { setGeoState('error'); return; }

    try {
      const url = `https://catalog.api.2gis.com/3.0/items/geocode?q=${encodeURIComponent(address)}&fields=items.point&key=${apiKey}`;
      const res = await fetch(url);

      if (res.status === 403 || res.status === 429) { setGeoState('limit'); return; }
      if (!res.ok) { setGeoState('error'); return; }

      const data: TwoGisResponse = await res.json();
      const point = data.result?.items?.[0]?.point;
      if (!point) { setGeoState('notfound'); return; }

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ lat: point.lat, lon: point.lon }));
      } catch {
        // ignore write errors
      }

      setCoords([point.lat, point.lon]);
      setGeoState('found');
    } catch {
      setGeoState('error');
    }
  }

  if (!address || isVirtualAddress(address)) return null;

  const fallbackHref = buildExternalMapSearchUrl(address);

  return (
    <div ref={wrapperRef} className={`gv-event-map ${className}`.trim()}>
      {(geoState === 'idle' || geoState === 'loading') && (
        <div
          className="gv-map-skeleton animate-pulse"
          style={{ height }}
          aria-label="Карта загружается"
        >
          <span />
        </div>
      )}

      {geoState === 'found' && coords && !mapExpanded && (
        <div
          className="gv-map-preview"
        >
          <div className="gv-map-preview__text">
            <span className="gv-map-dot" aria-hidden="true" />
            <span>{address}</span>
          </div>
          <button
            onClick={() => setMapExpanded(true)}
            className="gv-map-action"
          >
            Показать карту
          </button>
        </div>
      )}

      {geoState === 'found' && coords && mapExpanded && (
        <div style={{ height, ...MAP_STACKING_CONTEXT_STYLE }} className="gv-map-shell">
          <MapInner
            coords={coords}
            title={title}
            address={address}
            height={height}
          />
          <MapAttribution />
        </div>
      )}

      {(geoState === 'notfound' || geoState === 'error' || geoState === 'limit') && (
        <div
          className="gv-map-fallback"
        >
          <span className="gv-map-dot gv-map-dot--muted" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
              {address}
            </p>
          </div>
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="gv-map-link"
          >
            Открыть на карте →
          </a>
        </div>
      )}
    </div>
  );
}
