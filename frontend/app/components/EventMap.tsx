'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLngTuple } from 'leaflet';

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

  const customIcon = L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <path d="M20 2C13.373 2 8 7.373 8 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#01696f" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="14" r="4" fill="white"/>
    </svg>`,
    className: '',
    iconSize: [40, 40] as [number, number],
    iconAnchor: [20, 40] as [number, number],
    popupAnchor: [0, -42] as [number, number],
  });

  return (
    <MapContainer
      center={coords}
      zoom={15}
      scrollWheelZoom={false}
      attributionControl={false}
      style={{ height, width: '100%' }}
    >
      <TileLayer
        url="https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1"
        subdomains="0123"
      />
      <Marker position={coords} icon={customIcon}>
        <Popup>
          <strong>{title}</strong>
          {address && <><br />{address}</>}
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

  const fallbackHref = `https://2gis.ru/search/${encodeURIComponent(address)}`;

  return (
    <div ref={wrapperRef} className={className}>
      {(geoState === 'idle' || geoState === 'loading') && (
        <div
          className="animate-pulse rounded-2xl"
          style={{ height, background: 'var(--surface-2)' }}
        />
      )}

      {geoState === 'found' && coords && !mapExpanded && (
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 text-sm min-w-0" style={{ color: 'var(--text-muted)' }}>
            <span className="shrink-0">📍</span>
            <span className="truncate">{address}</span>
          </div>
          <button
            onClick={() => setMapExpanded(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-80 shrink-0"
            style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
          >
            Показать карту
          </button>
        </div>
      )}

      {geoState === 'found' && coords && mapExpanded && (
        <>
          <div style={{ height }} className="rounded-2xl overflow-hidden">
            <MapInner
              coords={coords}
              title={title}
              address={address}
              height={height}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            &copy;{' '}
            <a
              href="https://2gis.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-70 transition"
            >
              2ГИС
            </a>
          </p>
        </>
      )}

      {(geoState === 'notfound' || geoState === 'error' || geoState === 'limit') && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="text-2xl shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
              {address}
            </p>
          </div>
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold shrink-0 transition hover:opacity-70"
            style={{ color: 'var(--primary)' }}
          >
            Открыть на карте →
          </a>
        </div>
      )}
    </div>
  );
}
