'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLngTuple } from 'leaflet';
import {
  MAP_TILE_SUBDOMAINS,
  MAP_TILE_URL,
  MapAttribution,
  createMapPinIcon,
  formatMapPointLabel,
} from './map-ui';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PartyMeetingMapProps {
  partyId: number;
  isCreator: boolean;
  lat: number | null;
  lon: number | null;
  landmark: string | null;
  onSave: (lat: number, lon: number, landmark: string) => Promise<void>;
}

// ── Default center (Moscow) ───────────────────────────────────────────────────

const DEFAULT_CENTER: LatLngTuple = [55.7558, 37.6173];
const DEFAULT_ZOOM = 11;
const PIN_ZOOM = 15;

// ── VIEW inner map ────────────────────────────────────────────────────────────

interface MapViewInnerProps {
  coords: LatLngTuple;
  landmark: string | null;
}

function MapViewInnerComponent({ coords, landmark }: MapViewInnerProps) {
  const { MapContainer, TileLayer, Marker, Popup, useMap } = require('react-leaflet');
  const L = require('leaflet');

  const icon = createMapPinIcon(L, 'meeting', 40);

  // Re-center map when coords change via real-time socket update
  function FlyToController({ target }: { target: LatLngTuple }) {
    const map = useMap();
    useEffect(() => {
      // Avoid animated transitions here: when the component unmounts during mode switches,
      // Leaflet animation frames can touch a removed DOM node and throw `_leaflet_pos` errors.
      map.setView(target, PIN_ZOOM, { animate: false });
      return () => {
        map.stop();
      };
    }, [map, target]);
    return null;
  }

  return (
    <MapContainer
      center={coords}
      zoom={PIN_ZOOM}
      scrollWheelZoom={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url={MAP_TILE_URL}
        subdomains={MAP_TILE_SUBDOMAINS}
      />
      <FlyToController target={coords} />
      <Marker position={coords} icon={icon}>
        {landmark && (
          <Popup className="gv-map-popup">
            <div className="gv-map-popup-content">
              <strong>Точка встречи</strong>
              <span>{landmark}</span>
            </div>
          </Popup>
        )}
      </Marker>
    </MapContainer>
  );
}

const MapViewInner = dynamic(
  () => Promise.resolve(MapViewInnerComponent),
  { ssr: false }
);

// ── EDIT inner map ────────────────────────────────────────────────────────────

interface MapEditInnerProps {
  coords: LatLngTuple | null;
  onPick: (lat: number, lon: number) => void;
}

function MapEditInnerComponent({ coords, onPick }: MapEditInnerProps) {
  const { MapContainer, TileLayer, Marker, useMapEvents } = require('react-leaflet');
  const L = require('leaflet');

  const icon = createMapPinIcon(L, 'meeting', 40);

  function ClickHandler() {
    useMapEvents({
      click(e: { latlng: { lat: number; lng: number } }) {
        onPick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  const center: LatLngTuple = coords ?? DEFAULT_CENTER;
  const zoom = coords ? PIN_ZOOM : DEFAULT_ZOOM;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%', cursor: 'crosshair' }}
    >
      <TileLayer
        url={MAP_TILE_URL}
        subdomains={MAP_TILE_SUBDOMAINS}
      />
      <ClickHandler />
      {coords && (
        <Marker position={coords} icon={icon} />
      )}
    </MapContainer>
  );
}

const MapEditInner = dynamic(
  () => Promise.resolve(MapEditInnerComponent),
  { ssr: false }
);

// ── Map shell (shared wrapper) ────────────────────────────────────────────────

function MapShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="gv-map-shell gv-map-shell--meeting"
      style={{ height: '220px' }}
    >
      {children}
      <MapAttribution />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PartyMeetingMap({
  isCreator,
  lat,
  lon,
  landmark,
  onSave,
}: PartyMeetingMapProps) {
  const hasCoords = lat != null && lon != null;

  const [isEditing, setIsEditing] = useState(false);
  const [tempCoords, setTempCoords] = useState<LatLngTuple | null>(
    hasCoords ? [lat as number, lon as number] : null
  );
  const [tempLandmark, setTempLandmark] = useState(landmark ?? '');
  const [saving, setSaving] = useState(false);

  // Derived coords for the edit map: use tempCoords (which starts from stored values)
  const editCoords: LatLngTuple | null = tempCoords;

  const handleStartEdit = () => {
    setTempCoords(hasCoords ? [lat as number, lon as number] : null);
    setTempLandmark(landmark ?? '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTempCoords(hasCoords ? [lat as number, lon as number] : null);
    setTempLandmark(landmark ?? '');
  };

  const handlePick = (pickedLat: number, pickedLon: number) => {
    setTempCoords([pickedLat, pickedLon]);
  };

  const handleSave = async () => {
    if (!tempCoords) return;
    setSaving(true);
    try {
      await onSave(tempCoords[0], tempCoords[1], tempLandmark.trim());
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT mode ──────────────────────────────────────────────────────────────

  if (isCreator && isEditing) {
    return (
      <div className="flex flex-col gap-3">
        {!tempCoords && (
          <p
            className="gv-map-hint"
            style={{ color: 'var(--text-muted)' }}
          >
            Нажмите на карте, чтобы выбрать точку встречи
          </p>
        )}

        <MapShell>
          <MapEditInner coords={editCoords} onPick={handlePick} />
        </MapShell>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Ориентир
          </label>
          <input
            className="w-full rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore — CSS custom prop
              '--tw-ring-color': 'var(--primary)',
            }}
            placeholder="Например: у главного входа"
            maxLength={200}
            value={tempLandmark}
            onChange={(e) => setTempLandmark(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={!tempCoords || saving}
            className="gv-map-action gv-map-action--solid"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="gv-map-action"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  // ── VIEW mode (no coords, not creator) ────────────────────────────────────

  if (!hasCoords && !isCreator) {
    return (
      <p className="text-sm px-1" style={{ color: 'var(--text-faint)' }}>
        Организатор ещё не указал точку встречи
      </p>
    );
  }

  // ── VIEW mode (no coords, is creator) ─────────────────────────────────────

  if (!hasCoords && isCreator) {
    return (
      <div className="flex flex-col gap-3">
      <p className="text-sm px-1" style={{ color: 'var(--text-faint)' }}>
        Точка встречи ещё не указана
      </p>
      <button
        onClick={handleStartEdit}
        className="gv-map-action self-start"
      >
        Указать точку встречи
      </button>
    </div>
  );
  }

  // ── VIEW mode (has coords) ─────────────────────────────────────────────────

  const viewCoords: LatLngTuple = [lat as number, lon as number];
  // Yandex Maps: rtext=~lat,lon sets destination from current location
  const routeHref = `https://yandex.ru/maps/?rtext=~${lat}%2C${lon}&rtt=auto`;
  const pointLabel = formatMapPointLabel(landmark, lat as number, lon as number);

  return (
    <div className="flex flex-col gap-3">
      <MapShell>
        <MapViewInner coords={viewCoords} landmark={landmark} />
      </MapShell>

      <div className="gv-map-preview gv-map-preview--compact">
        <div className="gv-map-preview__text">
          <span className="gv-map-dot" aria-hidden="true" />
          <span>{pointLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 px-1 flex-wrap">
        <a
          href={routeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="gv-map-link"
        >
          Открыть маршрут →
        </a>

        {isCreator && (
          <button
            onClick={handleStartEdit}
            className="gv-map-action"
          >
            Изменить точку
          </button>
        )}
      </div>
    </div>
  );
}
