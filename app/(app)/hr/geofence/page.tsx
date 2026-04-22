'use client';

import { Button } from '@/components/ui/Button';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

const GeofenceMapEditor = dynamic(() => import('@/components/hr/geofence/GeofenceMapEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-400">
      Loading map editor...
    </div>
  ),
});

type Point = {
  lat: number;
  lng: number;
};

type ZoneSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  polygonPoints: Point[];
  gateLat: number;
  gateLng: number;
  gateRadiusMeters: number;
  centerLat: number | null;
  centerLng: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    events: number;
  };
};

type ZoneDetail = ZoneSummary & {
  events: Array<{
    id: string;
    employeeId: string | null;
    workDate: string | null;
    eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_PING' | 'MANUAL_OVERRIDE';
    validationStatus: 'VALID' | 'OUTSIDE_POLYGON' | 'OUTSIDE_GATE_RADIUS';
    distanceToGateMeters: number | null;
    notes: string | null;
    occurredAt: string;
    employee: {
      id: string;
      fullName: string;
      employeeCode: string;
      status: string;
    } | null;
  }>;
};

type ZoneFormState = {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
  polygonPoints: Point[];
  gatePoint: Point | null;
  gateRadiusMeters: number;
};

type DetectedLocationState = {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  capturedAt: number;
};

const emptyForm = (): ZoneFormState => ({
  id: null,
  name: '',
  description: '',
  isActive: true,
  polygonPoints: [],
  gatePoint: null,
  gateRadiusMeters: 30,
});

function normalizeZoneSummary(zone: ZoneSummary): ZoneSummary {
  return {
    ...zone,
    polygonPoints: Array.isArray(zone.polygonPoints) ? zone.polygonPoints : [],
  };
}

function formFromZone(zone: ZoneSummary | ZoneDetail): ZoneFormState {
  return {
    id: zone.id,
    name: zone.name,
    description: zone.description ?? '',
    isActive: zone.isActive,
    polygonPoints: Array.isArray(zone.polygonPoints) ? zone.polygonPoints : [],
    gatePoint: { lat: zone.gateLat, lng: zone.gateLng },
    gateRadiusMeters: zone.gateRadiusMeters ?? 30,
  };
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatMeters(value: number | null) {
  if (!Number.isFinite(value ?? NaN)) return '—';
  return `${Math.round(value ?? 0)} m`;
}

function buildGoogleMapsLink(point: Point | null) {
  if (!point) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}

export default function HrGeofencePage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);
  const [form, setForm] = useState<ZoneFormState>(emptyForm);
  const [editorMode, setEditorMode] = useState<'polygon' | 'gate'>('polygon');
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapFocusPoint, setMapFocusPoint] = useState<Point | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocationState | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.geofence.view');
  const canEdit = isSA || perms.includes('hr.geofence.edit');
  const detectedLocationMapsLink = buildGoogleMapsLink(
    detectedLocation ? { lat: detectedLocation.lat, lng: detectedLocation.lng } : null
  );

  async function readApiEnvelope(res: Response) {
    const text = await res.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as { success?: boolean; error?: string; data?: unknown };
    } catch {
      return null;
    }
  }

  async function loadZones() {
    setLoading(true);
    const res = await fetch('/api/hr/geofence/zones', { cache: 'no-store' });
    const json = await readApiEnvelope(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to load geofence zones');
      setLoading(false);
      return;
    }
    const nextZones = (json.data as ZoneSummary[]).map(normalizeZoneSummary);
    setZones(nextZones);
    setSelectedZoneId((current) => current ?? nextZones[0]?.id ?? null);
    setLoading(false);
  }

  async function loadZoneDetail(id: string) {
    const res = await fetch(`/api/hr/geofence/zones/${id}`, { cache: 'no-store' });
    const json = await readApiEnvelope(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to load geofence zone');
      return;
    }
    const detail = {
      ...(json.data as ZoneDetail),
      polygonPoints: Array.isArray(json.data?.polygonPoints) ? json.data.polygonPoints : [],
    };
    setSelectedZone(detail);
    setForm(formFromZone(detail));
    setMapFocusPoint({ lat: detail.gateLat, lng: detail.gateLng });
  }

  useEffect(() => {
    if (!canView) return;
    void (async () => {
      setLoading(true);
      const res = await fetch('/api/hr/geofence/zones', { cache: 'no-store' });
      const json = await readApiEnvelope(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Failed to load geofence zones');
        setLoading(false);
        return;
      }
      const nextZones = (json.data as ZoneSummary[]).map(normalizeZoneSummary);
      setZones(nextZones);
      setSelectedZoneId((current) => current ?? nextZones[0]?.id ?? null);
      setLoading(false);
    })();
  }, [canView]);

  useEffect(() => {
    if (!selectedZoneId) return;
    void (async () => {
      const res = await fetch(`/api/hr/geofence/zones/${selectedZoneId}`, { cache: 'no-store' });
      const json = await readApiEnvelope(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Failed to load geofence zone');
        return;
      }
      const detail = {
        ...(json.data as ZoneDetail),
        polygonPoints: Array.isArray(json.data?.polygonPoints) ? json.data.polygonPoints : [],
      };
      setSelectedZone(detail);
      setForm(formFromZone(detail));
      setMapFocusPoint({ lat: detail.gateLat, lng: detail.gateLng });
    })();
  }, [selectedZoneId]);

  const activeZoneCount = useMemo(() => zones.filter((zone) => zone.isActive).length, [zones]);
  const totalEventCount = useMemo(() => zones.reduce((sum, zone) => sum + (zone._count?.events ?? 0), 0), [zones]);

  const resetForNewZone = () => {
    setSelectedZoneId(null);
    setSelectedZone(null);
    setForm(emptyForm());
    setEditorMode('polygon');
    setMapFocusPoint(null);
  };

  const useCurrentLocation = async () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      toast.error('Current location is not available in this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const accuracyMeters = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        setForm((current) => ({
          ...current,
          gatePoint: point,
        }));
        setDetectedLocation({
          lat: point.lat,
          lng: point.lng,
          accuracyMeters,
          capturedAt: Date.now(),
        });
        setMapFocusPoint(point);
        setEditorMode('gate');
        setLocating(false);
        toast.success('Current location applied as gate point');
      },
      (error) => {
        setLocating(false);
        toast.error(error.message || 'Failed to fetch current location');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const saveZone = async () => {
    if (!canEdit) return;
    if (!form.name.trim()) {
      toast.error('Zone name is required');
      return;
    }
    if (form.polygonPoints.length < 3) {
      toast.error('Draw at least 3 polygon points');
      return;
    }
    if (!form.gatePoint) {
      toast.error('Set the gate point');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      isActive: form.isActive,
      polygonPoints: form.polygonPoints,
      gateLat: form.gatePoint.lat,
      gateLng: form.gatePoint.lng,
      gateRadiusMeters: form.gateRadiusMeters,
    };

    const res = await fetch(form.id ? `/api/hr/geofence/zones/${form.id}` : '/api/hr/geofence/zones', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await readApiEnvelope(res);
    setSaving(false);

    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save geofence zone');
      return;
    }

    toast.success(form.id ? 'Geofence zone updated' : 'Geofence zone created');
    await loadZones();
    const nextId = String(json.data?.id ?? form.id ?? '');
    if (nextId) {
      setSelectedZoneId(nextId);
      await loadZoneDetail(nextId);
    }
  };

  const deleteZone = async () => {
    if (!canEdit || !form.id) return;
    if (!window.confirm(`Delete geofence zone "${form.name}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/hr/geofence/zones/${form.id}`, { method: 'DELETE' });
    const json = await readApiEnvelope(res);
    setDeleting(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to delete geofence zone');
      return;
    }
    toast.success('Geofence zone deleted');
    await loadZones();
    resetForNewZone();
  };

  if (!canView) return <div className="text-slate-400">Forbidden</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">HR Geofence Attendance</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Factory polygon and gate setup</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Build a separate location-based attendance foundation for factories and gates. This does not replace your existing HR attendance module.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Zones</p>
              <p className="mt-2 text-2xl font-semibold text-white">{zones.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Active</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{activeZoneCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Recorded events</p>
              <p className="mt-2 text-2xl font-semibold text-sky-300">{totalEventCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Geofence zones</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Separate factory footprints for mobile geofence attendance.</p>
              </div>
              {canEdit ? (
                <Button type="button" size="sm" onClick={resetForNewZone}>
                  New zone
                </Button>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {loading ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Loading geofence zones...
                </div>
              ) : zones.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                  No zones yet. Create the first factory border and gate point.
                </div>
              ) : (
                zones.map((zone) => {
                  const isSelected = selectedZoneId === zone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setSelectedZoneId(zone.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-950/40 dark:hover:bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900 dark:text-white">{zone.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            zone.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {zone.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {zone.polygonPoints.length} points · Gate radius {Math.round(zone.gateRadiusMeters)} m
                      </p>
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{zone._count?.events ?? 0} recorded events</p>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Expo app readiness</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>Built-in APIs are ready for future mobile work:</p>
              <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>`GET /api/hr/geofence/zones` for active footprints</li>
                <li>`POST /api/hr/geofence/validate` for polygon + gate checks</li>
                <li>`POST /api/hr/geofence/events` for check-in or check-out logs</li>
                <li>`POST /api/me/mobile-auth/login` to mint a mobile bearer token from the existing employee portal login</li>
                <li>`GET /api/me/mobile-auth/me` to restore the employee session after app launch</li>
                <li>`POST /api/me/mobile-auth/logout` to revoke that mobile token</li>
                <li>`GET /api/me/geofence/zones` for employee-facing mobile zone fetch</li>
                <li>`POST /api/me/geofence/events` for employee-facing check-in or check-out submission</li>
                <li>`GET /api/me/geofence/history` for the employee’s recent geofence attendance history</li>
              </ul>
            </div>
          </section>
        </aside>

        <section className="space-y-6">
          <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {form.id ? `Edit zone: ${form.name}` : 'Create geofence zone'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Draw the factory border as a polygon, then place the gate point where mobile attendance should be accepted.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={editorMode === 'polygon' ? 'primary' : 'outline'} size="sm" onClick={() => setEditorMode('polygon')}>
                      Draw border
                    </Button>
                    <Button type="button" variant={editorMode === 'gate' ? 'primary' : 'outline'} size="sm" onClick={() => setEditorMode('gate')}>
                      Set gate
                    </Button>
                    <Button type="button" variant={mapStyle === 'streets' ? 'primary' : 'outline'} size="sm" onClick={() => setMapStyle('streets')}>
                      Map
                    </Button>
                    <Button type="button" variant={mapStyle === 'satellite' ? 'primary' : 'outline'} size="sm" onClick={() => setMapStyle('satellite')}>
                      Satellite
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} loading={locating} disabled={!canEdit}>
                      Use current location
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((current) => ({ ...current, polygonPoints: current.polygonPoints.slice(0, -1) }))}
                      disabled={form.polygonPoints.length === 0}
                    >
                      Undo point
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((current) => ({ ...current, polygonPoints: [], gatePoint: null }))}
                      disabled={form.polygonPoints.length === 0 && !form.gatePoint}
                    >
                      Clear map
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Zone name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      disabled={!canEdit}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                      placeholder="Factory main compound"
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Gate radius (meters)</span>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      step={1}
                      value={form.gateRadiusMeters}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          gateRadiusMeters: Number(event.target.value) > 0 ? Number(event.target.value) : 30,
                        }))
                      }
                      disabled={!canEdit}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 text-sm lg:col-span-2">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Description</span>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      disabled={!canEdit}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                      placeholder="Optional note for the factory, contractor, or mobile team."
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                      disabled={!canEdit}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Active zone
                  </label>
                </div>

                <div className="mt-5">
                  <GeofenceMapEditor
                    polygonPoints={form.polygonPoints}
                    gatePoint={form.gatePoint}
                    gateRadiusMeters={form.gateRadiusMeters}
                    mode={editorMode}
                    mapStyle={mapStyle}
                    focusPoint={mapFocusPoint}
                    heightClass="h-[46rem]"
                    onAddPolygonPoint={(point) => setForm((current) => ({ ...current, polygonPoints: [...current.polygonPoints, point] }))}
                    onSetGatePoint={(point) => {
                      setForm((current) => ({ ...current, gatePoint: point }));
                      setMapFocusPoint(point);
                    }}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Polygon points</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{form.polygonPoints.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Gate point</p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {form.gatePoint ? `${form.gatePoint.lat.toFixed(6)}, ${form.gatePoint.lng.toFixed(6)}` : 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Gate radius</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{Math.round(form.gateRadiusMeters)} m</p>
                  </div>
                </div>

                {detectedLocation ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm dark:border-sky-500/20 dark:bg-sky-500/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-medium text-sky-900 dark:text-sky-200">Browser-detected current location</p>
                      {detectedLocationMapsLink ? (
                        <a
                          href={detectedLocationMapsLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:border-sky-400 hover:text-sky-900 dark:border-sky-400/30 dark:bg-slate-950/40 dark:text-sky-200 dark:hover:border-sky-300/60 dark:hover:text-white"
                        >
                          <span>Open in Google Maps</span>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 17L17 7" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h9v9" />
                          </svg>
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-sky-700/70 dark:text-sky-300/70">Latitude</p>
                        <p className="mt-1 text-sky-900 dark:text-sky-100">{detectedLocation.lat.toFixed(6)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-sky-700/70 dark:text-sky-300/70">Longitude</p>
                        <p className="mt-1 text-sky-900 dark:text-sky-100">{detectedLocation.lng.toFixed(6)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-sky-700/70 dark:text-sky-300/70">Accuracy</p>
                        <p className="mt-1 text-sky-900 dark:text-sky-100">
                          {detectedLocation.accuracyMeters != null ? `${Math.round(detectedLocation.accuracyMeters)} m` : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-sky-700/70 dark:text-sky-300/70">Captured</p>
                        <p className="mt-1 text-sky-900 dark:text-sky-100">{formatDateTime(new Date(detectedLocation.capturedAt).toISOString())}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    {form.id ? (
                      <Button type="button" variant="danger" onClick={deleteZone} loading={deleting}>
                        Delete zone
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={resetForNewZone}>
                      Reset
                    </Button>
                    <Button type="button" onClick={saveZone} loading={saving}>
                      {form.id ? 'Save changes' : 'Create zone'}
                    </Button>
                  </div>
                ) : null}
              </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent geofence events</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Mobile-ready attendance hits for the selected zone.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {!selectedZone || selectedZone.events.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                    No recorded events yet for this zone.
                  </div>
                ) : (
                  selectedZone.events.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {event.employee?.fullName ?? 'Unknown employee'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {event.employee?.employeeCode ?? 'No employee code'} · {event.eventType.replaceAll('_', ' ')}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            event.validationStatus === 'VALID'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : event.validationStatus === 'OUTSIDE_GATE_RADIUS'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                          }`}
                        >
                          {event.validationStatus.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <p>{formatDateTime(event.occurredAt)}</p>
                        <p className="mt-1">Distance to gate: {formatMeters(event.distanceToGateMeters)}</p>
                        {event.notes ? <p className="mt-1 text-slate-600 dark:text-slate-300">{event.notes}</p> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
