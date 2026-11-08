import asyncio
import logging
import os
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
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

try:
    from backend.clerk_auth import clerk_router, require_user
except ModuleNotFoundError:
    from clerk_auth import clerk_router, require_user


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
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PilotProfileUpdate(BaseModel):
    simbrief_pilot_id: Optional[str] = None
    display_name: Optional[str] = None


class Waypoint(BaseModel):
    ident: str
    name: Optional[str] = None
    airway: Optional[str] = None
    altitude: Optional[str] = None
    wind: Optional[str] = None
    tas: Optional[str] = None
    gs: Optional[str] = None
    distance: Optional[str] = None
    ete: Optional[str] = None
    eta: Optional[str] = None
    fob: Optional[str] = None
    fuel_burn: Optional[str] = None
    passed: bool = False


class FuelPlan(BaseModel):
    taxi: Optional[str] = None
    trip: Optional[str] = None
    contingency: Optional[str] = None
    alternate: Optional[str] = None
    reserve: Optional[str] = None
    extra: Optional[str] = None
    block: Optional[str] = None


class Flight(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    callsign: Optional[str] = None
    aircraft: Optional[str] = None
    origin: Optional[str] = None
    origin_name: Optional[str] = None
    destination: Optional[str] = None
    destination_name: Optional[str] = None
    alternate: Optional[str] = None
    route: Optional[str] = None
    cruise_level: Optional[str] = None
    distance: Optional[str] = None
    ete: Optional[str] = None
    sched_out: Optional[str] = None
    sched_in: Optional[str] = None
    pax: Optional[str] = None
    waypoints: List[Waypoint] = Field(default_factory=list)
    fuel: FuelPlan = Field(default_factory=FuelPlan)
    raw_simbrief_id: Optional[str] = None
    imported_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ImportRequest(BaseModel):
    pilot_id: Optional[str] = None


class WaypointToggle(BaseModel):
    ident: str
    passed: bool


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
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["user_id"] = user["user_id"]
    await db.pilots.update_one(
        {"user_id": user["user_id"]},
        {"$set": update},
        upsert=True,
    )
    doc = await db.pilots.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return PilotProfile(**doc)


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
                fob=_text(fix, "fuel_onboard"),
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
    )

    return Flight(
        user_id=user_id,
        callsign=_text(general, "icao_airline", "") + _text(general, "flight_number", "") if general is not None else None,
        aircraft=_text(aircraft, "icaocode") if aircraft is not None else None,
        origin=_text(origin, "icao_code") if origin is not None else None,
        origin_name=_text(origin, "name") if origin is not None else None,
        destination=_text(destination, "icao_code") if destination is not None else None,
        destination_name=_text(destination, "name") if destination is not None else None,
        alternate=_text(alternate, "icao_code") if alternate is not None else None,
        route=_text(general, "route") if general is not None else None,
        cruise_level=_text(general, "initial_altitude") if general is not None else None,
        distance=_text(general, "route_distance") if general is not None else None,
        ete=_text(times, "est_time_enroute") if times is not None else None,
        sched_out=_text(times, "sched_out") if times is not None else None,
        sched_in=_text(times, "sched_in") if times is not None else None,
        pax=_text(weights, "pax_count") if weights is not None else None,
        waypoints=waypoints,
        fuel=fuel_plan,
        raw_simbrief_id=_text(params, "request_id") if params is not None else None,
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
        resp = requests.get(url, timeout=20, headers={"User-Agent": "e-navlog/1.0"})
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"SimBrief unreachable: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"SimBrief returned {resp.status_code}")

    try:
        flight = _parse_simbrief_xml(resp.text, user["user_id"])
    except ET.ParseError as e:
        raise HTTPException(status_code=502, detail=f"Could not parse SimBrief XML: {e}")

    await db.flights.insert_one(flight.model_dump())
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
    doc = await db.flights.find_one({"id": flight_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Flight not found")
    updated = False
    for wp in doc.get("waypoints", []):
        if wp.get("ident") == body.ident:
            wp["passed"] = body.passed
            updated = True
    if not updated:
        raise HTTPException(status_code=404, detail="Waypoint not found")
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"waypoints": doc["waypoints"]}},
    )
    return Flight(**doc)


@api_router.post("/flights/{flight_id}/reset", response_model=Flight)
async def reset_tracker(flight_id: str, user: dict = Depends(require_user)):
    doc = await db.flights.find_one({"id": flight_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Flight not found")
    for wp in doc.get("waypoints", []):
        wp["passed"] = False
    await db.flights.update_one(
        {"id": flight_id, "user_id": user["user_id"]},
        {"$set": {"waypoints": doc["waypoints"]}},
    )
    return Flight(**doc)


app.include_router(api_router)
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
