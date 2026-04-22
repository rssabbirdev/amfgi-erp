export type LatLngPoint = {
  lat: number;
  lng: number;
};

export type GeofenceValidationResult = {
  insidePolygon: boolean;
  withinGateRadius: boolean;
  distanceToGateMeters: number | null;
  status: 'VALID' | 'OUTSIDE_POLYGON' | 'OUTSIDE_GATE_RADIUS';
};

const EARTH_RADIUS_METERS = 6371000;

export function normalizeLatLngPoint(input: unknown): LatLngPoint | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as { lat?: unknown; lng?: unknown; lon?: unknown };
  const lat = typeof candidate.lat === 'number' ? candidate.lat : Number(candidate.lat);
  const lngValue = candidate.lng ?? candidate.lon;
  const lng = typeof lngValue === 'number' ? lngValue : Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function normalizePolygonPoints(input: unknown): LatLngPoint[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeLatLngPoint).filter((point): point is LatLngPoint => Boolean(point));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMeters(a: LatLngPoint, b: LatLngPoint) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isPointInPolygon(point: LatLngPoint, polygon: LatLngPoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function computePolygonCenter(points: LatLngPoint[]): LatLngPoint | null {
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length,
  };
}

export function validateGeofencePoint(args: {
  point: LatLngPoint;
  polygon: LatLngPoint[];
  gate: LatLngPoint;
  gateRadiusMeters: number;
}): GeofenceValidationResult {
  const insidePolygon = isPointInPolygon(args.point, args.polygon);
  const distanceToGateMeters = haversineMeters(args.point, args.gate);
  const withinGateRadius = distanceToGateMeters <= args.gateRadiusMeters;
  const status = insidePolygon
    ? withinGateRadius
      ? 'VALID'
      : 'OUTSIDE_GATE_RADIUS'
    : 'OUTSIDE_POLYGON';

  return {
    insidePolygon,
    withinGateRadius,
    distanceToGateMeters,
    status,
  };
}
