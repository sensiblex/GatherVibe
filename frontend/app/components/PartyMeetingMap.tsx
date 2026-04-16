'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LatLngTuple } from 'leaflet';

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

// ── Shared pin SVG factory ────────────────────────────────────────────────────

function buildIcon(L: { divIcon: Function }, color: string) {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <path d="M20 2C13.373 2 8 7.373 8 14c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="14" r="4" fill="white"/>
    </svg>`,
    className: '',
    iconSize: [40, 40] as [number, number],
    iconAnchor: [20, 40] as [number, number],
    popupAnchor: [0, -42] as [number, number],
  });
}

// ── VIEW inner map ────────────────────────────────────────────────────────────

interface MapViewInnerProps {
  coords: LatLngTuple;
  landmark: string | null;
}

function MapViewInnerComponent({ coords, landmark }: MapViewInnerProps) {
  const { MapContainer, TileLayer, Marker, Popup, useMap } = require('react-leaflet');
  const L = require('leaflet');

  const icon = buildIcon(L, '#610bef');

  // Re-center map when coords change via real-time socket update
  function FlyToController({ target }: { target: LatLngTuple }) {
    const map = useMap();
    useEffect(() => { map.flyTo(target, PIN_ZOOM); }, [target[0], target[1]]); // eslint-disable-line react-hooks/exhaustive-deps
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
        url="https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1"
        subdomains="0123"
      />
      <FlyToController target={coords} />
      <Marker position={coords} icon={icon}>
        {landmark && (
          <Popup>
            <strong>{landmark}</strong>
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

  const icon = buildIcon(L, '#610bef');

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
        url="https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1"
        subdomains="0123"
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
      className="rounded-2xl overflow-hidden"
      style={{ height: '220px', width: '100%' }}
    >
      {children}
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
            className="text-xs font-medium px-1"
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

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!tempCoords || saving}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-lg transition hover:opacity-70 disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
          >
            Отмена
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
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
          className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-80"
          style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
        >
          + Указать точку встречи
        </button>
      </div>
    );
  }

  // ── VIEW mode (has coords) ─────────────────────────────────────────────────

  const viewCoords: LatLngTuple = [lat as number, lon as number];
  // Yandex Maps: rtext=~lat,lon sets destination from current location
  const routeHref = `https://yandex.ru/maps/?rtext=~${lat}%2C${lon}&rtt=auto`;

  return (
    <div className="flex flex-col gap-3">
      <MapShell>
        <MapViewInner coords={viewCoords} landmark={landmark} />
      </MapShell>

      {landmark && (
        <div className="flex items-center gap-2 text-sm px-1">
          <span className="shrink-0">📍</span>
          <span style={{ color: 'var(--text-muted)' }}>{landmark}</span>
        </div>
      )}

      <div className="flex items-center gap-3 px-1">
        <a
          href={routeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold transition hover:opacity-80"
          style={{ color: 'var(--primary)' }}
        >
          Открыть маршрут →
        </a>

        {isCreator && (
          <button
            onClick={handleStartEdit}
            className="text-xs font-medium transition hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            Изменить точку
          </button>
        )}
      </div>

      <p className="text-xs px-1" style={{ color: 'var(--text-faint)' }}>
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
    </div>
  );
}
