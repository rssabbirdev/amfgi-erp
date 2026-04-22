# HR Geofence Attendance - Expo Integration Guide

This project now includes a separate polygon geofence attendance backend for factory use. It is intentionally separate from the existing HR attendance module.

## Purpose

Use this flow when an employee is physically near the factory gate and the mobile app needs to:

- restore the employee session
- fetch active factory zones
- submit check-in / check-out / location-ping events
- show recent geofence attendance history

## Admin setup in web app

HR users configure factory zones from:

- `/hr/geofence`

They can:

- draw the factory border polygon
- place the gate entry point
- set the accepted gate radius in meters

## Mobile auth flow

The Expo app should use the employee self-service login credentials, but through a separate mobile token endpoint.

### 1. Login

`POST /api/me/mobile-auth/login`

Body:

```json
{
  "email": "me.emp001@amfgi.com",
  "password": "Employee@1234",
  "deviceLabel": "Expo Android - Ahmed"
}
```

Response returns:

- `token`
- `tokenType`
- `expiresAt`
- employee identity
- active company identity

Store the token securely in Expo SecureStore.

### 2. Restore session on app launch

`GET /api/me/mobile-auth/me`

Headers:

```http
Authorization: Bearer <token>
```

Use this to confirm:

- token is still valid
- employee identity
- active company
- active geofence zone count

### 3. Logout

`POST /api/me/mobile-auth/logout`

Headers:

```http
Authorization: Bearer <token>
```

This revokes the mobile token.

## Zone fetch

`GET /api/me/geofence/zones`

Headers:

```http
Authorization: Bearer <token>
```

Response contains:

- employee identity
- active zone list
- polygon points
- gate point
- gate radius

Recommended Expo use:

- fetch after login
- cache in memory
- refresh when app returns to foreground

## Event submit

`POST /api/me/geofence/events`

Headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Example body:

```json
{
  "zoneId": "zone_id_here",
  "eventType": "CHECK_IN",
  "latitude": 25.01029,
  "longitude": 55.14055,
  "accuracyMeters": 8,
  "occurredAt": "2026-04-22T08:12:00.000Z",
  "devicePlatform": "android",
  "deviceIdentifier": "expo-device-001",
  "notes": "Morning gate scan"
}
```

The server automatically validates:

- inside polygon or not
- within gate radius or not
- distance to gate in meters

Response includes:

- saved event
- zone info
- employee info
- validation result

## History fetch

`GET /api/me/geofence/history?limit=50`

Optional query params:

- `limit`
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

Use this for:

- recent activity list
- attendance confirmation screen
- debugging failed/outside submissions

## Recommended Expo screen flow

### Screen 1 - Mobile login

- employee enters email + password
- call `/api/me/mobile-auth/login`
- store token

### Screen 2 - Session bootstrap

- call `/api/me/mobile-auth/me`
- call `/api/me/geofence/zones`
- if no active zones, show a clear empty state

### Screen 3 - Check-in/out

- request foreground location permission
- get current GPS coordinates and accuracy
- allow employee to choose:
  - Check in
  - Check out
- send event to `/api/me/geofence/events`
- show server validation result immediately

### Screen 4 - History

- call `/api/me/geofence/history`
- show:
  - event type
  - timestamp
  - zone
  - validation status
  - distance to gate

## Suggested Expo implementation notes

- use `expo-location` for GPS
- use `expo-secure-store` for bearer token storage
- use a small request wrapper that always adds the `Authorization` header
- treat server validation as the source of truth
- do not trust only client-side polygon math

## Suggested error handling

### `401 Unauthorized`

- token missing, invalid, or expired
- clear stored token
- send user back to login

### `403`

- employee portal disabled
- employee no longer linked to active company

### `404 Active geofence zone not found`

- zone was deleted or deactivated after app cached it
- refresh zone list before retrying

### `OUTSIDE_POLYGON`

- employee is outside the factory border

### `OUTSIDE_GATE_RADIUS`

- employee may be inside the factory polygon but too far from gate entry point

## Shared contract file

For stable DTO names, see:

- [C:\almuraqib-custom-application\AMFGI\lib\hr\geofenceMobileContracts.ts](C:/almuraqib-custom-application/AMFGI/lib/hr/geofenceMobileContracts.ts)

This file is intended to help the future Expo app mirror the backend payload shapes cleanly.
