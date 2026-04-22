'use client';

import 'leaflet/dist/leaflet.css';

import { MapContainer, TileLayer, Polygon, Polyline, Circle, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import type { LatLngTuple, LeafletMouseEvent } from 'leaflet';
import { useEffect } from 'react';

type Point = {
  lat: number;
  lng: number;
};

type EditorMode = 'polygon' | 'gate';
type MapStyle = 'streets' | 'satellite';

function FitToGeometry({
  polygonPoints,
  gatePoint,
  focusPoint,
}: {
  polygonPoints: Point[];
  gatePoint: Point | null;
  focusPoint?: Point | null;
}) {
  const map = useMapEvents({});

  useEffect(() => {
    if (focusPoint) {
      map.setView([focusPoint.lat, focusPoint.lng], 22, { animate: true });
      return;
    }
    if (polygonPoints.length >= 3) {
      map.fitBounds(polygonPoints.map((point) => [point.lat, point.lng] as LatLngTuple), {
        padding: [28, 28],
      });
      return;
    }
    if (gatePoint) {
      map.setView([gatePoint.lat, gatePoint.lng], 21, { animate: true });
    }
  }, [focusPoint, gatePoint, map, polygonPoints]);

  return null;
}

function ClickCapture({
  mode,
  onAddPolygonPoint,
  onSetGatePoint,
}: {
  mode: EditorMode;
  onAddPolygonPoint: (point: Point) => void;
  onSetGatePoint: (point: Point) => void;
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (mode === 'gate') onSetGatePoint(point);
      else onAddPolygonPoint(point);
    },
  });
  return null;
}

export default function GeofenceMapEditor({
  polygonPoints,
  gatePoint,
  gateRadiusMeters,
  mode,
  mapStyle = 'streets',
  focusPoint,
  heightClass = 'h-[42rem]',
  onAddPolygonPoint,
  onSetGatePoint,
}: {
  polygonPoints: Point[];
  gatePoint: Point | null;
  gateRadiusMeters: number;
  mode: EditorMode;
  mapStyle?: MapStyle;
  focusPoint?: Point | null;
  heightClass?: string;
  onAddPolygonPoint: (point: Point) => void;
  onSetGatePoint: (point: Point) => void;
}) {
  const defaultCenter: LatLngTuple = gatePoint
    ? [gatePoint.lat, gatePoint.lng]
    : polygonPoints[0]
      ? [polygonPoints[0].lat, polygonPoints[0].lng]
      : [25.2048, 55.2708];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/40">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Factory geofence map</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click the map to {mode === 'gate' ? 'set the gate point' : 'add polygon points around the factory border'}.
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {mode === 'gate' ? 'Gate mode' : 'Polygon mode'}
        </span>
      </div>

      <div className={`${heightClass} w-full`}>
        <MapContainer
          center={defaultCenter}
          zoom={19}
          minZoom={3}
          maxZoom={24}
          scrollWheelZoom
          doubleClickZoom
          touchZoom
          className="h-full w-full"
        >
          {mapStyle === 'satellite' ? (
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={24}
              maxNativeZoom={20}
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={24}
              maxNativeZoom={19}
            />
          )}
          <ClickCapture mode={mode} onAddPolygonPoint={onAddPolygonPoint} onSetGatePoint={onSetGatePoint} />
          <FitToGeometry polygonPoints={polygonPoints} gatePoint={gatePoint} focusPoint={focusPoint} />

          {polygonPoints.length >= 2 ? (
            <Polyline positions={polygonPoints.map((point) => [point.lat, point.lng] as LatLngTuple)} pathOptions={{ color: '#0f766e', weight: 3 }} />
          ) : null}
          {polygonPoints.length >= 3 ? (
            <Polygon positions={polygonPoints.map((point) => [point.lat, point.lng] as LatLngTuple)} pathOptions={{ color: '#059669', fillColor: '#34d399', fillOpacity: 0.2 }} />
          ) : null}

          {polygonPoints.map((point, index) => (
            <CircleMarker
              key={`${point.lat}-${point.lng}-${index}`}
              center={[point.lat, point.lng]}
              radius={6}
              pathOptions={{ color: '#065f46', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent={polygonPoints.length <= 8}>
                {index + 1}
              </Tooltip>
            </CircleMarker>
          ))}

          {gatePoint ? (
            <>
              <Circle
                center={[gatePoint.lat, gatePoint.lng]}
                radius={gateRadiusMeters}
                pathOptions={{ color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.18, weight: 2 }}
              />
              <CircleMarker
                center={[gatePoint.lat, gatePoint.lng]}
                radius={8}
                pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
                  Gate
                </Tooltip>
              </CircleMarker>
            </>
          ) : null}
        </MapContainer>
      </div>
    </div>
  );
}
