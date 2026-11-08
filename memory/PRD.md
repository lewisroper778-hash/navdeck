# e-navlog — Product Requirements Document

## Problem Statement
Create an app, called e-navlog for flight simulator that can have multiple accounts and integrates with SimBrief.

## User Choices (locked)
- SimBrief integration: Pilot ID via public API (xml.fetcher.php)
- Auth: JWT-based email + password (delivered via Emergent-managed Clerk; Google also enabled)
- Features v1: waypoint table, fuel plan, live tracker, PDF export — all included
- Visual style: modern clean light theme (EFB-inspired)
- Multi-account scope: each pilot's own saved flights only (strict per-user isolation)

## Architecture
- FastAPI backend (`/api/*`) + MongoDB (`pilots`, `flights` collections)
- React 19 + Tailwind + Shadcn-compatible UI
- Clerk for authentication (`require_user` dependency on every data route)
- SimBrief XML fetched server-side and parsed into `Flight` schema

## Core Requirements (static)
- Per-user data isolation
- One-click OFP import from SimBrief
- Waypoint-by-waypoint navlog
- Fuel plan summary
- Live tracker (toggle waypoint passed state)
- Print/PDF export of navlog

## Implemented (2026-02-08)
- Auth: Clerk email+password + Google via `/api/clerk/config`, `require_user`
- Pilot profile: GET/PUT `/api/me` — store SimBrief Pilot ID + display name
- SimBrief import: POST `/api/flights/import` — parses XML into Flight (waypoints, fuel, route, times)
- Flights: list, get, delete (`/api/flights`, `/api/flights/{id}`)
- Live tracker: POST `/api/flights/{id}/waypoint` (toggle), POST `/api/flights/{id}/reset`
- Pages: Sign-in (split layout), Sign-up, Dashboard (flight cards + import), Flight detail (summary, fuel, navlog, print), Settings (Pilot ID)
- Design: Work Sans headings, IBM Plex Sans body, IBM Plex Mono flight data; off-white background, aviation blue accent, flat EFB-style tables
- Verified: 11/11 backend tests pass (auth, isolation, CRUD, tracker, SimBrief error handling)

## Backlog
- P1: Alternate/cost index panels, performance (speeds, weights) card, map view (route line on world map)
- P2: Multiple OFP history per flight, share flight read-only link, dark cockpit theme toggle
- P2: In-flight progress auto-advance (manual tick off → voice/keyboard shortcuts)
