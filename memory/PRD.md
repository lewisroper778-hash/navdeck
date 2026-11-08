# e-navlog — Product Requirements Document

## Original problem statement
"create me an app, called e-navlog for flight simulator that can have multiple accounts and integrates with simbrief"

Iteration 2: "make it more modern and with these features: automatic import of your latest SimBrief OFP (route, fuel, times, weights, KG or LB); electronic navlog: log ATA and FOB at any waypoint, with deviations and ETOs updated instantly; fuel check chart, holding time before diverting, minimum fuel and Mayday fuel states; actual passengers and cargo, with ZFW, TOW and LAW checked against aircraft limits; block times (OFF / T-O / LDG / ON), TSAT and CTOT with a live countdown; signed end-of-flight report exported as a PDF with the airline logo; airline logos shown automatically, day and night mode, works offline once loaded"

Iteration 3: "make this more rounded edges, and make sure airline logos are visible, also add things to different pages. to follow a process from pushback to arrival at the gate, add a landing rate entry for the end, and time they left the gate, arrived at the gate. and a close flight button when everything has been completed. make it optimised for an Ipad, and look better with rounded edges and colours"

## User choices
- SimBrief link by Pilot ID (public xml.fetcher API)
- Accounts: Emergent-managed Clerk (email + password, Google also enabled)
- Each pilot sees only their own flights
- Light theme by default, with night mode

## Architecture
- FastAPI (`/api/*`) + MongoDB (`pilots`, `flights`); unique partial index (user_id, raw_simbrief_id)
- React + Tailwind; Clerk auth; recharts fuel chart; service worker + per-pilot localStorage cache for offline use
- All weights/fuel stored in the OFP's own units (`weights.ofp_units`); KG/LB is a display conversion

## Implemented
- 2026-02 MVP: auth, SimBrief import, waypoint table, fuel summary, tracker, print
- 2026-11 Iteration 2: auto-sync of latest OFP on dashboard (deduped), ATA/FOB logging with instant ETO, ΔT and ΔF, fuel check chart, min/Mayday fuel states, hold-before-divert, loadsheet with pax/cargo and ZFW/TOW/LAW limits, TSAT/CTOT countdowns, signed report PDF with logo, airline logos, night mode, offline
- 2026-11 Iteration 3: 5-step flight process on separate pages (Briefing → Pushback → Enroute → Arrival → Close) with a stepper and Next/Prev; Left gate / Takeoff / Landing / Arrived at gate tiles; landing rate entry with rating; fuel at gate; completion checklist; Close Flight (server-validated) that locks the flight, with Reopen; rounder, colour-coded design; iPad landscape and portrait layouts with 44px+ touch targets; web-app manifest
- Hardening: closed flights reject edits (409), HH:MM and numeric validation, waypoint edits by index, non-blocking SimBrief fetch

## Backlog
- P1: Flight logbook totals (hours, landings, average landing rate)
- P1: Route map with the aircraft's progress
- P2: Hand-drawn signature, more checklist items (e.g. METAR/ATIS notes), sharing a read-only report link
