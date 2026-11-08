import asyncio
import logging
import os
import re
import uuid
import xml.etree.ElementTree as ET
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

try:
    from backend.clerk_auth import clerk_router, require_user
    from backend.extras import build_router, store_report
    from backend.bridge import build_bridge_router
except ModuleNotFoundError:
    from clerk_auth import clerk_router, require_user
    from extras import build_router, store_report
    from bridge import build_bridge_router


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

INDEXES: dict[str, list[IndexModel]] = {
    "pilots": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
    ],
    "flights": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("user_id", ASCENDING), ("imported_at", DESCENDING)], name="user_imported"),
        IndexModel(
            [("user_id", ASCENDING), ("raw_simbrief_id", ASCENDING)],
            name="user_ofp_unique",
            unique=True,
            partialFilterExpression={"raw_simbrief_id": {"$type": "string"}},
        ),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error(
                    "ensure_indexes(%s.%s): %s",
                    collection, model.document["name"], exc,
                )


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------

class PilotProfile(BaseModel):
    user_id: str
    simbrief_pilot_id: Optional[str] = None
    display_name: Optional[str] = None
    vatsim_cid: Optional[str] = None
    vatsim_friends: list[str] = []
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PilotProfileUpdate(BaseModel):
    simbrief_pilot_id: Optional[str] = None
    display_name: Optional[str] = None
    vatsim_cid: Optional[str] = None
    vatsim_friends: Optional[list[str]] = None

    @field_validator("vatsim_friends")
    @classmethod
    def _friends(cls, v):
        if v is None:
            return v
        out = list(dict.fromkeys(x.strip().upper() for x in v if x.strip()))
        if len(out) > 50 or any(not re.fullmatch(r"[A-Z0-9_-]{2,12}", x) for x in out):
            raise ValueError("Friends must be up to 50 callsigns or CIDs (2–12 letters/digits)")
        return out


class Waypoint(BaseModel):
    ident: str
    name: Optional[str] = None
    airway: Optional[str] = None
    altitude: Optional[str] = None
    wind: Optional[str] = None
    tas: Optional[str] = None
    gs: Optional[str] = None
    distance: Optional[str] = None
    ete: Optional[str] = None  # seconds, leg time
    eta: Optional[str] = None  # seconds, total
    fob: Optional[str] = None  # planned FOB at this waypoint
    min_fob: Optional[str] = None  # minimum required FOB at this waypoint
    fuel_burn: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    passed: bool = False
    # Actuals (pilot-entered)
    ata: Optional[str] = None  # "HH:MM" UTC actual time arrived
    actual_fob: Optional[str] = None  # entered FOB number


class FuelPlan(BaseModel):
    taxi: Optional[str] = None
    trip: Optional[str] = None
    contingency: Optional[str] = None
    alternate: Optional[str] = None
    reserve: Optional[str] = None
    extra: Optional[str] = None
    block: Optional[str] = None
    min_takeoff: Optional[str] = None
    min_fuel: Optional[str] = None  # alternate + reserve
    mayday_fuel: Optional[str] = None  # reserve only
    avg_burn_per_hour: Optional[str] = None  # trip / ete-hours


class Weights(BaseModel):
    units: str = "KG"  # display units, KG or LB
    ofp_units: str = "KG"  # units all stored numbers are in
    oew: Optional[str] = None
    payload: Optional[str] = None
    zfw: Optional[str] = None
    tow: Optional[str] = None
    law: Optional[str] = None
    max_zfw: Optional[str] = None
    max_tow: Optional[str] = None
    max_law: Optional[str] = None
    pax_count: Optional[str] = None
    cargo: Optional[str] = None
    pax_weight: Optional[str] = None  # per pax incl. bags
    planned_pax: Optional[str] = None
    planned_cargo: Optional[str] = None


class BlockTimes(BaseModel):
    sched_off: Optional[str] = None
    sched_takeoff: Optional[str] = None
    sched_landing: Optional[str] = None
    sched_on: Optional[str] = None
    off: Optional[str] = None  # "HH:MM" UTC — block off (push)
    takeoff: Optional[str] = None
    landing: Optional[str] = None
    on: Optional[str] = None  # block on (parked)
    tsat: Optional[str] = None  # Target Start-up Approval Time
    ctot: Optional[str] = None  # Calculated Take-Off Time


class SignOff(BaseModel):
    signed: bool = False
    signed_by: Optional[str] = None
    signed_at: Optional[str] = None
    remarks: Optional[str] = None
    signature: Optional[str] = None  # PNG data URL from the finger/pencil pad


class Flight(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    callsign: Optional[str] = None
    airline_icao: Optional[str] = None
    airline_name: Optional[str] = None
    aircraft: Optional[str] = None
    aircraft_name: Optional[str] = None
    origin: Optional[str] = None
    origin_name: Optional[str] = None
    destination: Optional[str] = None
    destination_name: Optional[str] = None
    alternate: Optional[str] = None
    alternate_name: Optional[str] = None
    route: Optional[str] = None
    cruise_level: Optional[str] = None
    distance: Optional[str] = None
    ete: Optional[str] = None
    sched_out: Optional[str] = None
    sched_in: Optional[str] = None
    pax: Optional[str] = None
    waypoints: List[Waypoint] = Field(default_factory=list)
    fuel: FuelPlan = Field(default_factory=FuelPlan)
    weights: Weights = Field(default_factory=Weights)
    times: BlockTimes = Field(default_factory=BlockTimes)
    signoff: SignOff = Field(default_factory=SignOff)
    landing_rate: Optional[str] = None  # fpm, entered after landing
    arrival_fob: Optional[str] = None  # fuel on board at gate (OFP units)
    status: str = "open"  # open | closed
    closed_at: Optional[str] = None
    arrival_notes: dict = Field(default_factory=dict)
    ai: dict = Field(default_factory=dict)
    notams: dict = Field(default_factory=dict)
    raw_simbrief_id: Optional[str] = None
    imported_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ImportRequest(BaseModel):
    pilot_id: Optional[str] = None


HHMM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _check_hhmm(v):
    if v and not HHMM_RE.match(v):
        raise ValueError("Time must be HH:MM (UTC)")
    return v


class WaypointToggle(BaseModel):
    ident: str
    passed: bool
    index: Optional[int] = None


class WaypointLog(BaseModel):
    ident: str
    index: Optional[int] = None
    ata: Optional[str] = None
    actual_fob: Optional[str] = None

    _ata = field_validator("ata")(_check_hhmm)

    @field_validator("actual_fob")
    @classmethod
    def _fob(cls, v):
        if v and not v.replace(".", "", 1).isdigit():
            raise ValueError("FOB must be a number")
        return v


class TimesUpdate(BaseModel):
    off: Optional[str] = None
    takeoff: Optional[str] = None
    landing: Optional[str] = None
    on: Optional[str] = None
    tsat: Optional[str] = None
    ctot: Optional[str] = None

    _times = field_validator("off", "takeoff", "landing", "on", "tsat", "ctot")(_check_hhmm)


class ActualsUpdate(BaseModel):
    pax_count: Optional[str] = None
    cargo: Optional[str] = None
    units: Optional[str] = None  # KG or LB

    @field_validator("pax_count", "cargo")
    @classmethod
    def _non_negative(cls, v):
        if v and not v.replace(".", "", 1).isdigit():
            raise ValueError("Must be a positive number")
        return v


class SignRequest(BaseModel):
    signed_by: str
    remarks: Optional[str] = None
    signature: Optional[str] = Field(default=None, max_length=400_000)


class ArrivalUpdate(BaseModel):
    landing_rate: Optional[str] = None
    arrival_fob: Optional[str] = None

    @field_validator("landing_rate")
    @classmethod
    def _numeric(cls, v):
        if v and not v.lstrip("-").replace(".", "", 1).isdigit():
            raise ValueError("Landing rate must be a number")
        return v

    @field_validator("arrival_fob")
    @classmethod
    def _fob(cls, v):
        if v and not v.replace(".", "", 1).isdigit():
            raise ValueError("Fuel at gate must be a positive number")
        return v


async def _owned_flight(flight_id: str, user_id: str) -> dict:
    doc = await db.flights.find_one({"id": flight_id, "user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Flight not found")
    return doc


async def _editable_flight(flight_id: str, user_id: str) -> dict:
    doc = await _owned_flight(flight_id, user_id)
    if doc.get("status") == "closed":
        raise HTTPException(status_code=409, detail="Flight is closed. Reopen it to make changes.")
    return doc


def _target_waypoints(doc: dict, ident: str, index: Optional[int]) -> list:
    wps = doc.get("waypoints", [])
    if index is not None:
        if 0 <= index < len(wps) and wps[index].get("ident") == ident:
            return [wps[index]]
        raise HTTPException(status_code=404, detail="Waypoint not found")
    found = [wp for wp in wps if wp.get("ident") == ident]
    if not found:
        raise HTTPException(status_code=404, detail="Waypoint not found")
    return found


def _close_blockers(doc: dict) -> List[str]:
    t = doc.get("times") or {}
    missing = [label for key, label in (
        ("off", "Left gate time"), ("takeoff", "Takeoff time"),
        ("landing", "Landing time"), ("on", "Arrived at gate time"),
    ) if not t.get(key)]
    if not doc.get("landing_rate"):
        missing.append("Landing rate")
    if not (doc.get("signoff") or {}).get("signed"):
        missing.append("Signed report")
    return missing


# ---------- Routes ----------

@api_router.get("/")
async def root():
    return {"message": "e-navlog API"}


@api_router.get("/me", response_model=PilotProfile)
async def get_me(user: dict = Depends(require_user)):
    doc = await db.pilots.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        profile = PilotProfile(user_id=user["user_id"])
        await db.pilots.insert_one(profile.model_dump())
        return profile
    return PilotProfile(**doc)


@api_router.put("/me", response_model=PilotProfile)
async def update_me(body: PilotProfileUpdate, user: dict = Depends(require_user)):
    # Empty string or null clears a field (e.g. removing a VATSIM CID)
    update = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in body.model_dump(exclude_unset=True).items()}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["user_id"] = user["user_id"]
    await db.pilots.update_one(
        {"user_id": user["user_id"]},
        {"$set": update},
        upsert=True,
    )
    doc = await db.pilots.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return PilotProfile(**doc)


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _backfill(existing: dict, fresh: Flight) -> dict:
    # Older imports lack coordinates / min take-off fuel; copy them in without touching actuals
    wps = existing.get("waypoints") or []
    if len(wps) == len(fresh.waypoints) and any(w.get("lat") is None for w in wps):
        for w, n in zip(wps, fresh.waypoints):
            w["lat"], w["lon"] = n.lat, n.lon
        existing.setdefault("fuel", {})["min_takeoff"] = fresh.fuel.min_takeoff
        await db.flights.update_one({"id": existing["id"]}, {"$set": {"waypoints": wps, "fuel.min_takeoff": fresh.fuel.min_takeoff}})
    if not existing.get("notams") and fresh.notams:
        existing["notams"] = fresh.notams
        await db.flights.update_one({"id": existing["id"]}, {"$set": {"notams": fresh.notams}})
    return existing


def _dtg_iso(v):
    # SimBrief enroute NOTAMs use YYYYMMDDhhmm
    if v and len(v) == 12 and v.isdigit():
        return f"{v[:4]}-{v[4:6]}-{v[6:8]}T{v[8:10]}:{v[10:]}:00Z"
    return v


def _parse_notams(root, groups: dict) -> dict:
    out = {}
    for key, icao in groups.items():
        out[key] = [{"id": _text(n, "notam_id"), "location": _text(n, "location_icao") or icao, "text": _text(n, "notam_text") or "",
                     "raw": _text(n, "notam_raw"), "effective": _text(n, "date_effective"), "expires": _text(n, "date_expire"),
                     "category": _text(n, "notam_qcode_category")} for n in root.findall(f"{key}/notam")]
    known = {i for i in groups.values() if i}
    out["enroute"] = [{"id": _text(n, "notam_id"), "location": _text(n, "icao_id"), "text": _text(n, "notam_report") or "",
                       "raw": _text(n, "notam_text"), "effective": _dtg_iso(_text(n, "notam_effective_dtg")),
                       "expires": _dtg_iso(_text(n, "notam_expire_dtg")), "category": None}
                      for n in root.findall("notams/notamdrec") if _text(n, "icao_id") not in known]
    return out


def _text(elem, path, default=None):
    found = elem.find(path)
    if found is None or found.text is None:
        return default
    return found.text.strip()


def _parse_simbrief_xml(xml_text: str, user_id: str) -> Flight:
    root = ET.fromstring(xml_text)

    fetch_status = _text(root, "fetch/status")
    if fetch_status and "success" not in fetch_status.lower():
        raise HTTPException(status_code=400, detail=f"SimBrief: {fetch_status}")

    general = root.find("general")
    origin = root.find("origin")
    destination = root.find("destination")
    alternate = root.find("alternate")
    aircraft = root.find("aircraft")
    fuel = root.find("fuel")
    times = root.find("times")
    weights = root.find("weights")
    params = root.find("params")

    waypoints: List[Waypoint] = []
    nav = root.find("navlog")
    if nav is not None:
        for fix in nav.findall("fix"):
            waypoints.append(Waypoint(
                ident=_text(fix, "ident", "") or "",
                name=_text(fix, "name"),
                airway=_text(fix, "via_airway"),
                altitude=_text(fix, "altitude_feet"),
                wind=f"{_text(fix, 'wind_dir', '---')}/{_text(fix, 'wind_spd', '---')}",
                tas=_text(fix, "true_airspeed"),
                gs=_text(fix, "groundspeed"),
                distance=_text(fix, "distance"),
                ete=_text(fix, "time_leg"),
                eta=_text(fix, "time_total"),
                fob=_text(fix, "fuel_plan_onboard"),
                min_fob=_text(fix, "fuel_min_onboard"),
                lat=_float(_text(fix, "pos_lat")),
                lon=_float(_text(fix, "pos_long")),
                fuel_burn=_text(fix, "fuel_totalused"),
            ))

    fuel_plan = FuelPlan(
        taxi=_text(fuel, "taxi") if fuel is not None else None,
        trip=_text(fuel, "enroute_burn") if fuel is not None else None,
        contingency=_text(fuel, "contingency") if fuel is not None else None,
        alternate=_text(fuel, "alternate_burn") if fuel is not None else None,
        reserve=_text(fuel, "reserve") if fuel is not None else None,
        extra=_text(fuel, "extra") if fuel is not None else None,
        block=_text(fuel, "plan_ramp") if fuel is not None else None,
        min_takeoff=_text(fuel, "min_takeoff") if fuel is not None else None,
    )
    # Derived fuel states
    try:
        alt_v = float(fuel_plan.alternate or 0)
        res_v = float(fuel_plan.reserve or 0)
        fuel_plan.min_fuel = str(int(alt_v + res_v))
        fuel_plan.mayday_fuel = str(int(res_v))
        trip_v = float(fuel_plan.trip or 0)
        ete_s = float(_text(times, "est_time_enroute") or 0) if times is not None else 0
        if ete_s > 0 and trip_v > 0:
            fuel_plan.avg_burn_per_hour = str(int(trip_v / (ete_s / 3600)))
    except (TypeError, ValueError):
        pass

    units_raw = (_text(root, "params/units") or "kgs").upper()
    units = "LB" if units_raw.startswith("LB") else "KG"

    weights_block = Weights(
        units=units,
        ofp_units=units,
        oew=_text(weights, "oew") if weights is not None else None,
        payload=_text(weights, "payload") if weights is not None else None,
        zfw=_text(weights, "est_zfw") if weights is not None else None,
        tow=_text(weights, "est_tow") if weights is not None else None,
        law=_text(weights, "est_ldw") if weights is not None else None,
        max_zfw=_text(weights, "max_zfw") if weights is not None else None,
        max_tow=_text(weights, "max_tow") if weights is not None else None,
        max_law=_text(weights, "max_ldw") if weights is not None else None,
        pax_count=_text(weights, "pax_count") if weights is not None else None,
        cargo=_text(weights, "cargo") if weights is not None else None,
        pax_weight=_text(weights, "pax_weight") if weights is not None else None,
        planned_pax=_text(weights, "pax_count") if weights is not None else None,
        planned_cargo=_text(weights, "cargo") if weights is not None else None,
    )

    def _hhmm_from_ts(ts):
        if not ts:
            return None
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%H:%M")
        except (TypeError, ValueError):
            return None

    t = (lambda k: _text(times, k)) if times is not None else (lambda k: None)
    block_times = BlockTimes(
        sched_off=_hhmm_from_ts(t("sched_out")),
        sched_takeoff=_hhmm_from_ts(t("sched_off")),
        sched_landing=_hhmm_from_ts(t("sched_on")),
        sched_on=_hhmm_from_ts(t("sched_in")),
    )

    return Flight(
        user_id=user_id,
        callsign=(_text(general, "icao_airline", "") or "") + (_text(general, "flight_number", "") or "") if general is not None else None,
        airline_icao=_text(general, "icao_airline") if general is not None else None,
        airline_name=_text(root, "api_params/airline"),
        aircraft=_text(aircraft, "icaocode") if aircraft is not None else None,
        aircraft_name=_text(aircraft, "name") if aircraft is not None else None,
        origin=_text(origin, "icao_code") if origin is not None else None,
        origin_name=_text(origin, "name") if origin is not None else None,
        destination=_text(destination, "icao_code") if destination is not None else None,
        destination_name=_text(destination, "name") if destination is not None else None,
        alternate=_text(alternate, "icao_code") if alternate is not None else None,
        alternate_name=_text(alternate, "name") if alternate is not None else None,
        route=_text(general, "route") if general is not None else None,
        cruise_level=_text(general, "initial_altitude") if general is not None else None,
        distance=_text(general, "route_distance") if general is not None else None,
        ete=_text(times, "est_time_enroute") if times is not None else None,
        sched_out=_text(times, "sched_out") if times is not None else None,
        sched_in=_text(times, "sched_in") if times is not None else None,
        pax=_text(weights, "pax_count") if weights is not None else None,
        waypoints=waypoints,
        fuel=fuel_plan,
        weights=weights_block,
        times=block_times,
        raw_simbrief_id=_text(params, "request_id") if params is not None else None,
        notams=_parse_notams(root, {k: _text(e, "icao_code") if e is not None else None for k, e in (("origin", origin), ("destination", destination), ("alternate", alternate))}),
    )


@api_router.post("/flights/import", response_model=Flight)
async def import_from_simbrief(body: ImportRequest, user: dict = Depends(require_user)):
    pilot_id = body.pilot_id
    if not pilot_id:
        profile = await db.pilots.find_one({"user_id": user["user_id"]}, {"_id": 0})
        pilot_id = (profile or {}).get("simbrief_pilot_id")
    if not pilot_id:
        raise HTTPException(status_code=400, detail="No SimBrief Pilot ID configured")

    url = f"https://www.simbrief.com/api/xml.fetcher.php?userid={pilot_id}"
    try:
        resp = await run_in_threadpool(
            requests.get, url, timeout=20, headers={"User-Agent": "e-navlog/1.0"}
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"SimBrief unreachable: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"SimBrief returned {resp.status_code}")

    try:
        flight = _parse_simbrief_xml(resp.text, user["user_id"])
    except ET.ParseError as e:
        raise HTTPException(status_code=502, detail=f"Could not parse SimBrief XML: {e}")

    query = {"user_id": user["user_id"], "raw_simbrief_id": flight.raw_simbrief_id}
    if flight.raw_simbrief_id:
        existing = await db.flights.find_one(query, {"_id": 0})
        if existing:
            return Flight(**await _backfill(existing, flight))
    try:
        await db.flights.insert_one(flight.model_dump())
    except DuplicateKeyError:
        return Flight(**await db.flights.find_one(query, {"_id": 0}))
    return flight


@api_router.get("/flights", response_model=List[Flight])
async def list_flights(user: dict = Depends(require_user)):
    docs = await db.flights.find({"user_id": user["user_id"]}, {"_id": 0}).sort("imported_at", -1).to_list(200)
    return [Flight(**d) for d in docs]


@api_router.get("/flights/{flight_id}", response_model=Flight)
async def get_flight(flight_id: str, user: dict = Depends(require_user)):
    doc = await db.flights.find_one({"id": flight_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Flight not found")
    return Flight(**doc)


@api_router.delete("/flights/{flight_id}")
async def delete_flight(flight_id: str, user: dict = Depends(require_user)):
    result = await db.flights.delete_one({"id": flight_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flight not found")
    return {"ok": True}


@api_router.post("/flights/{flight_id}/waypoint", response_model=Flight)
async def toggle_waypoint(flight_id: str, body: WaypointToggle, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    for wp in _target_waypoints(doc, body.ident, body.index):
        wp["passed"] = body.passed
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"waypoints": doc["waypoints"]}},
    )
    return Flight(**doc)


@api_router.post("/flights/{flight_id}/reset", response_model=Flight)
async def reset_tracker(flight_id: str, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    for wp in doc.get("waypoints", []):
        wp["passed"] = False
        wp["ata"] = None
        wp["actual_fob"] = None
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {
            "waypoints": doc["waypoints"],
            "signoff": {"signed": False},
            "landing_rate": None,
            "arrival_fob": None,
            "status": "open",
            "closed_at": None,
            "arrival_notes": {},
            "ai": {},
            **{f"times.{k}": None for k in ("off", "takeoff", "landing", "on", "tsat", "ctot")},
        }},
    )
    doc = await db.flights.find_one({"id": flight_id, "user_id": user["user_id"]}, {"_id": 0})
    return Flight(**doc)


@api_router.patch("/flights/{flight_id}/waypoint-log", response_model=Flight)
async def log_waypoint(flight_id: str, body: WaypointLog, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    for wp in _target_waypoints(doc, body.ident, body.index):
        if body.ata is not None:
            wp["ata"] = body.ata or None
            wp["passed"] = bool(wp["ata"])
        if body.actual_fob is not None:
            wp["actual_fob"] = body.actual_fob or None
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"waypoints": doc["waypoints"]}},
    )
    return Flight(**doc)


@api_router.patch("/flights/{flight_id}/times", response_model=Flight)
async def update_times(flight_id: str, body: TimesUpdate, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    times = doc.get("times") or {}
    for k, v in body.model_dump(exclude_unset=True).items():
        times[k] = v or None
    doc["times"] = times
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"times": times}},
    )
    return Flight(**doc)


@api_router.patch("/flights/{flight_id}/actuals", response_model=Flight)
async def update_actuals(flight_id: str, body: ActualsUpdate, user: dict = Depends(require_user)):
    data = body.model_dump(exclude_unset=True)
    # Display-unit switching stays allowed on closed flights; loadsheet edits do not
    only_units = set(data) <= {"units"}
    doc = await (_owned_flight if only_units else _editable_flight)(flight_id, user["user_id"])
    weights = doc.get("weights") or {"units": "KG"}
    if "pax_count" in data:
        weights["pax_count"] = data["pax_count"]
    if "cargo" in data:
        weights["cargo"] = data["cargo"]
    if data.get("units") in ("KG", "LB"):
        # Stored values stay in OFP units; this only changes the display unit
        weights.setdefault("ofp_units", weights.get("units", "KG"))
        weights["units"] = data["units"]
    doc["weights"] = weights
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"weights": weights}},
    )
    return Flight(**doc)


@api_router.post("/flights/{flight_id}/signoff", response_model=Flight)
async def sign_report(flight_id: str, body: SignRequest, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    signoff = {
        "signed": True,
        "signed_by": body.signed_by,
        "signed_at": datetime.now(timezone.utc).isoformat(),
        "remarks": body.remarks,
        "signature": body.signature if (body.signature or "").startswith("data:image/png;base64,") else None,
    }
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"signoff": signoff}},
    )
    doc["signoff"] = signoff
    return Flight(**doc)


@api_router.patch("/flights/{flight_id}/arrival", response_model=Flight)
async def update_arrival(flight_id: str, body: ArrivalUpdate, user: dict = Depends(require_user)):
    doc = await _editable_flight(flight_id, user["user_id"])
    update = {k: (v or None) for k, v in body.model_dump(exclude_unset=True).items()}
    if update:
        await db.flights.update_one({"id": flight_id, "user_id": user["user_id"]}, {"$set": update})
        doc.update(update)
    return Flight(**doc)


@api_router.post("/flights/{flight_id}/close", response_model=Flight)
async def close_flight(flight_id: str, user: dict = Depends(require_user)):
    doc = await _owned_flight(flight_id, user["user_id"])
    missing = _close_blockers(doc)
    if missing:
        raise HTTPException(status_code=400, detail="Cannot close flight, missing: " + ", ".join(missing))
    update = {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()}
    await db.flights.update_one({"id": flight_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    try:
        await store_report(db, doc)
    except Exception as exc:  # flight stays closed; PDF can be regenerated by closing again
        logger.error("report upload failed for %s: %s", flight_id, exc)
    return Flight(**doc)


@api_router.post("/flights/{flight_id}/reopen", response_model=Flight)
async def reopen_flight(flight_id: str, user: dict = Depends(require_user)):
    doc = await _owned_flight(flight_id, user["user_id"])
    update = {"status": "open", "closed_at": None}
    await db.flights.update_one({"id": flight_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return Flight(**doc)


app.include_router(api_router)
app.include_router(build_router(db, _owned_flight, _editable_flight))
app.include_router(build_bridge_router(db))


@app.get("/health")
async def health():
    return {"status": "ok"}
app.include_router(clerk_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
