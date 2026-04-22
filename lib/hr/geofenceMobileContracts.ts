export type GeofencePointDto = {
  lat: number;
  lng: number;
};

export type GeofenceZoneDto = {
  id: string;
  name: string;
  description: string | null;
  polygonPoints: GeofencePointDto[];
  gateLat: number;
  gateLng: number;
  gateRadiusMeters: number;
  centerLat: number | null;
  centerLng: number | null;
  updatedAt?: string;
};

export type EmployeeGeofenceIdentityDto = {
  id: string;
  fullName: string;
  employeeCode: string;
};

export type CompanyIdentityDto = {
  id: string;
  name: string;
  slug: string;
};

export type MobileAuthLoginRequestDto = {
  email: string;
  password: string;
  deviceLabel?: string | null;
};

export type MobileAuthLoginResponseDto = {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  employee: EmployeeGeofenceIdentityDto & {
    status: string;
  };
  company: CompanyIdentityDto;
};

export type MobileAuthMeResponseDto = {
  authMode: 'session' | 'token';
  employee: EmployeeGeofenceIdentityDto;
  company: CompanyIdentityDto;
  geofence: {
    activeZoneCount: number;
  };
};

export type MeGeofenceZonesResponseDto = {
  employee: EmployeeGeofenceIdentityDto;
  zones: GeofenceZoneDto[];
};

export type MeGeofenceEventRequestDto = {
  zoneId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_PING';
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  occurredAt?: string;
  devicePlatform?: string | null;
  deviceIdentifier?: string | null;
  notes?: string | null;
  metadata?: unknown;
};

export type GeofenceValidationDto = {
  insidePolygon: boolean;
  withinGateRadius: boolean;
  distanceToGateMeters: number | null;
  status: 'VALID' | 'OUTSIDE_POLYGON' | 'OUTSIDE_GATE_RADIUS';
};

export type MeGeofenceEventResponseDto = {
  employee: EmployeeGeofenceIdentityDto;
  zone: {
    id: string;
    name: string;
  };
  id: string;
  zoneId: string;
  employeeId: string;
  workDate: string | null;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_PING';
  validationStatus: 'VALID' | 'OUTSIDE_POLYGON' | 'OUTSIDE_GATE_RADIUS';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  distanceToGateMeters: number | null;
  insidePolygon: boolean;
  withinGateRadius: boolean;
  devicePlatform: string | null;
  deviceIdentifier: string | null;
  notes: string | null;
  occurredAt: string;
  validation: GeofenceValidationDto;
};

export type MeGeofenceHistoryItemDto = {
  id: string;
  workDate: string | null;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_PING';
  validationStatus: 'VALID' | 'OUTSIDE_POLYGON' | 'OUTSIDE_GATE_RADIUS';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  distanceToGateMeters: number | null;
  insidePolygon: boolean;
  withinGateRadius: boolean;
  devicePlatform: string | null;
  deviceIdentifier: string | null;
  notes: string | null;
  occurredAt: string;
  zone: {
    id: string;
    name: string;
  };
};

export type MeGeofenceHistoryResponseDto = {
  employee: EmployeeGeofenceIdentityDto;
  events: MeGeofenceHistoryItemDto[];
};
