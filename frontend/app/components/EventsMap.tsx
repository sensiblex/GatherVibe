'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

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
import { MAP_STACKING_CONTEXT_STYLE } from '../events/map-layering';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { proxiedImageUrl } from '../lib/imageProxy';
import {
  MAP_TILE_SUBDOMAINS,
  MAP_TILE_URL,
  MapAttribution,
  createMapPinIcon,
  mapShellHeight,
} from './map-ui';

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
  let MarkerClusterGroup: any = null;
  try {
    MarkerClusterGroup = require('react-leaflet-cluster').default;
  } catch {
    MarkerClusterGroup = null;
  }
  const L = require('leaflet');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const pinIcon = createMapPinIcon(L, 'event', 32);

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
        url={MAP_TILE_URL}
        subdomains={MAP_TILE_SUBDOMAINS}
      />
      <FitBounds bounds={bounds} />
      {MarkerClusterGroup ? (
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
                <Popup maxWidth={280} className="gv-map-popup">
                <div className="gv-map-event-popup">
                  {coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt=""
                    />
                  )}
                  <strong>
                    {displayTitle}
                  </strong>
                  {ev.place_title && (
                    <div>
                      <span className="gv-map-popup-label">Место</span>
                      {ev.place_title}
                    </div>
                  )}
                  {ev.start_date && (
                    <div>
                      <span className="gv-map-popup-label">Когда</span>
                      {ev.start_date}
                      {ev.start_time ? `, ${ev.start_time}` : ''}
                    </div>
                  )}
                  <div>
                    <span className="gv-map-popup-label">Цена</span>
                    {ev.is_free ? 'Бесплатно' : (ev.price || 'Платно')}
                  </div>
                  {onEventClick ? (
                    <button
                      onClick={() => onEventClick(ev)}
                      className="gv-map-popup-action"
                    >
                      Подробнее
                    </button>
                  ) : (
                    <Link
                      href={`/events/${ev.kudago_id}`}
                      className="gv-map-popup-action"
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
      ) : (
        <>
          {events.map((ev) => {
            const displayTitle = capitalizeFirstDisplayChar(ev.title);
            const coverUrl = proxiedImageUrl(ev.cover_url);
            return (
              <Marker
                key={ev.kudago_id}
                position={[ev.lat as number, ev.lon as number]}
                icon={pinIcon}
              >
                <Popup maxWidth={280} className="gv-map-popup">
                <div className="gv-map-event-popup">
                  {coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt=""
                    />
                  )}
                  <strong>
                    {displayTitle}
                  </strong>
                  {ev.place_title && (
                    <div>
                      <span className="gv-map-popup-label">Место</span>
                      {ev.place_title}
                    </div>
                  )}
                  {ev.start_date && (
                    <div>
                      <span className="gv-map-popup-label">Когда</span>
                      {ev.start_date}
                      {ev.start_time ? `, ${ev.start_time}` : ''}
                    </div>
                  )}
                  <div>
                    <span className="gv-map-popup-label">Цена</span>
                    {ev.is_free ? 'Бесплатно' : (ev.price || 'Платно')}
                  </div>
                  {onEventClick ? (
                    <button
                      onClick={() => onEventClick(ev)}
                      className="gv-map-popup-action"
                    >
                      Подробнее
                    </button>
                  ) : (
                    <Link
                      href={`/events/${ev.kudago_id}`}
                      className="gv-map-popup-action"
                    >
                      Подробнее
                    </Link>
                  )}
                </div>
                </Popup>
              </Marker>
            );
          })}
        </>
      )}
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

  const containerHeight = mapShellHeight(isMobile, height, mobileHeight);

  return (
    <div className="gv-events-map">
      <div className="gv-events-map__header">
        <div className="gv-events-map__title">
          <span className="gv-section-mark" aria-hidden="true" />
          <h2>
            Карта событий
          </h2>
          <span className="gv-map-count">
            {formatMapStats(mapped.length, events.length)}
          </span>
        </div>
        <button
          onClick={toggleCollapse}
          className="gv-map-toggle"
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Показать карту' : 'Скрыть карту'}
        </button>
      </div>

      {!collapsed && (
        <div
          className="gv-map-shell gv-map-shell--events"
          style={{
            height: containerHeight,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            ...MAP_STACKING_CONTEXT_STYLE,
          }}
        >
          {mapped.length === 0 ? (
            <div className="gv-map-empty">
              <span className="gv-map-empty-icon" aria-hidden="true" />
              <p>
                Нет событий с координатами по текущим фильтрам
              </p>
              <p>
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
              <MapAttribution />
            </>
          )}
        </div>
      )}
    </div>
  );
}
