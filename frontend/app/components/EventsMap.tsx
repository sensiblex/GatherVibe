'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { LatLngTuple, LatLngBoundsExpression } from 'leaflet';
import type { KudaGoEvent } from './EventCard';
import {
  filterEventsWithCoords,
  computeBounds,
  cityCenter,
  formatMapStats,
} from '../events/events-map';
import type { CitySlug } from '../events/event-filters';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { proxiedImageUrl } from '../lib/imageProxy';

interface EventsMapProps {
  events: KudaGoEvent[];
  city: CitySlug;
  onEventClick?: (event: KudaGoEvent) => void;
  height?: string;
  mobileHeight?: string;
}

// ── Inner map: SSR-unsafe, loaded only on the client ─────────────────────────

interface MapInnerProps {
  events: KudaGoEvent[];
  center: LatLngTuple;
  bounds: LatLngBoundsExpression | null;
  onEventClick?: (event: KudaGoEvent) => void;
}

function MapInnerComponent({ events, center, bounds, onEventClick }: MapInnerProps) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { MapContainer, TileLayer, Marker, Popup, useMap } = require('react-leaflet');
  const MarkerClusterGroup = require('react-leaflet-cluster').default;
  const L = require('leaflet');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const pinIcon = L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 40 40">
      <path d="M20 2C13.373 2 8 7.373 8 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#610bef" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="14" r="4" fill="white"/>
    </svg>`,
    className: '',
    iconSize: [32, 32] as [number, number],
    iconAnchor: [16, 32] as [number, number],
    popupAnchor: [0, -34] as [number, number],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
    const map = useMap();
    useEffect(() => {
      if (bounds && map) {
        const timer = setTimeout(() => {
          try {
            if (map._panes?.mapPane) {
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            }
          } catch {
            // bounds can be invalid for a single point — Leaflet handles it, ignore
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [map, bounds]);
    return null;
  }

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1"
        subdomains="0123"
      />
      <FitBounds bounds={bounds} />
      <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
        {events.map((ev) => {
          const displayTitle = capitalizeFirstDisplayChar(ev.title);
          const coverUrl = proxiedImageUrl(ev.cover_url);
          return (
            <Marker
              key={ev.kudago_id}
              position={[ev.lat as number, ev.lon as number]}
              icon={pinIcon}
            >
              <Popup maxWidth={260}>
              <div style={{ minWidth: 200 }}>
                {coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                  />
                )}
                <strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
                  {displayTitle}
                </strong>
                {ev.place_title && (
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    📍 {ev.place_title}
                  </div>
                )}
                {ev.start_date && (
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    🗓 {ev.start_date}
                    {ev.start_time ? `, ${ev.start_time}` : ''}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  💰 {ev.is_free ? 'Бесплатно' : (ev.price || 'Платно')}
                </div>
                {onEventClick ? (
                  <button
                    onClick={() => onEventClick(ev)}
                    style={{
                      display: 'inline-block',
                      padding: '6px 12px',
                      background: '#610bef',
                      color: 'white',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    Подробнее
                  </button>
                ) : (
                  <Link
                    href={`/events/${ev.kudago_id}`}
                    style={{
                      display: 'inline-block',
                      padding: '6px 12px',
                      background: '#610bef',
                      color: 'white',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    Подробнее
                  </Link>
                )}
              </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

const MapInner = dynamic(() => Promise.resolve(MapInnerComponent), { ssr: false });

// ── Public component ─────────────────────────────────────────────────────────

export default function EventsMap({
  events,
  city,
  onEventClick,
  height = '420px',
  mobileHeight = '320px',
}: EventsMapProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('gv_events_map_collapsed');
      if (saved === '1') setCollapsed(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const mapped = useMemo(() => filterEventsWithCoords(events), [events]);
  const bounds = useMemo(() => {
    const b = computeBounds(mapped);
    if (!b) return null;
    return [[b.minLat, b.minLon], [b.maxLat, b.maxLon]] as LatLngBoundsExpression;
  }, [mapped]);

  const center = useMemo<LatLngTuple>(() => {
    const c = cityCenter(city);
    return [c.lat, c.lon];
  }, [city]);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gv_events_map_collapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const containerHeight = isMobile ? mobileHeight : height;

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 40px 32px',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 4,
              height: 28,
              borderRadius: 999,
              background: 'var(--primary)',
            }}
          />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            Карта событий
          </h2>
          <span
            style={{
              fontSize: '.8125rem',
              color: 'var(--text-muted)',
              background: 'var(--surface-2)',
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            {formatMapStats(mapped.length, events.length)}
          </span>
        </div>
        <button
          onClick={toggleCollapse}
          style={{
            padding: '.4rem .9rem',
            borderRadius: 'var(--r-full)',
            fontSize: '.8125rem',
            background: 'var(--surface-2)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Показать карту' : 'Скрыть карту'}
        </button>
      </div>

      {!collapsed && (
        <div
          style={{
            height: containerHeight,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            position: 'relative',
          }}
        >
          {mapped.length === 0 ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                background: 'var(--surface)',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: 24,
              }}
            >
              <span style={{ fontSize: 40 }}>🗺</span>
              <p style={{ fontSize: '.9375rem', fontWeight: 600, margin: 0 }}>
                Нет событий с координатами по текущим фильтрам
              </p>
              <p style={{ fontSize: '.8125rem', margin: 0 }}>
                Попробуйте изменить фильтры или выбрать другой город
              </p>
            </div>
          ) : (
            <>
              <MapInner
                events={mapped}
                center={center}
                bounds={bounds}
                onEventClick={onEventClick}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 10,
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  background: 'rgba(255,255,255,0.85)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  pointerEvents: 'auto',
                  zIndex: 500,
                }}
              >
                &copy;{' '}
                <a
                  href="https://2gis.ru"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                  2ГИС
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
