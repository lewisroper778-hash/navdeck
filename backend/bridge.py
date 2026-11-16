import hashlib
import re
import secrets
import requests
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

try:
    from backend.clerk_auth import require_user
    from backend.pdf_report import build_report_pdf
except ModuleNotFoundError:
    from clerk_auth import require_user
    from pdf_report import build_report_pdf

LB_PER_KG = 2.20462


class BridgeEvent(BaseModel):
    type: Literal["off", "takeoff", "landing", "on"]
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    landing_rate: Optional[float] = Field(default=None, ge=0, le=5000)
    fuel_lb: Optional[float] = Field(default=None, ge=0, le=2_000_000)


class BridgeWaypoint(BaseModel):
    index: int = Field(ge=0)
    ident: str = Field(max_length=20)
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    fuel_lb: Optional[float] = Field(default=None, ge=0, le=2_000_000)
    altitude_ft: Optional[float] = Field(default=None, ge=-2000, le=60000)


class BridgeHeartbeat(BaseModel):
    sim: Optional[str] = Field(default=None, max_length=60)
    aircraft: Optional[str] = Field(default=None, max_length=120)
    connected: bool = True


class BridgeTarget(BaseModel):
    flight_id: str


class DesktopFlightAction(BaseModel):
    action: Literal["toggleWaypoint", "skipWaypoint", "directTo", "undoDirect",
                    "saveWaypoint", "saveTimes", "saveActuals", "saveArrival",
                    "signReport", "closeFlight", "reopenFlight", "resetFlight", "saveNotes",
                    "recordGoAround", "reviewGoAround"]
    payload: dict = Field(default_factory=dict)


class DesktopImportRequest(BaseModel):
    # An explicitly entered Pilot ID can be used without waiting for profile
    # sync, while still using the same SimBrief parser and flight ownership.
    pilot_id: Optional[str] = Field(default=None, pattern=r"^\d{1,16}$")


class DesktopPilotUpdate(BaseModel):
    simbrief_pilot_id: Optional[str] = Field(default=None, pattern=r"^\d{1,16}$")
    display_name: Optional[str] = Field(default=None, max_length=80)
    vatsim_cid: Optional[str] = Field(default=None, pattern=r"^\d{6,8}$")
    vatsim_friends: Optional[list[str]] = Field(default=None, max_length=50)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def build_bridge_router(db, simbrief_import=None, flight_ops=None) -> APIRouter:
    r = APIRouter(prefix="/api/bridge")

    async def bridge_user(x_bridge_token: str = Header(default="")) -> dict:
        if not re.fullmatch(r"[A-Za-z0-9_-]{30,80}", x_bridge_token or ""):
            raise HTTPException(status_code=401, detail="Missing or invalid connection code")
        rec = await db.bridge_links.find_one({"token_hash": _hash(x_bridge_token)}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=401, detail="Connection code not recognised; create a new one in NAVDECK")
        return rec

    async def target_flight(link: dict) -> Optional[dict]:
        q = {"user_id": link["user_id"], "status": {"$ne": "closed"}}
        if link.get("flight_id"):
            f = await db.flights.find_one(q | {"id": link["flight_id"]}, {"_id": 0})
            if f:
                return f
        return await db.flights.find_one(q, {"_id": 0}, sort=[("imported_at", -1)])

    @r.get("/desktop/active")
    async def desktop_active_flight(link: dict = Depends(bridge_user)):
        # One database lookup and one desktop round-trip for the primary
        # in-flight reporting screen, instead of a summary request followed
        # by a second detail request.
        flight = await target_flight(link)
        return {"flight": flight}

    @r.get("/desktop/flights/{flight_id}")
    async def desktop_flight_detail(flight_id: str, link: dict = Depends(bridge_user)):
        f = await db.flights.find_one(
            {"id": flight_id, "user_id": link["user_id"]}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Flight not found")
        return {"flight": f}

    @r.post("/desktop/flights/{flight_id}/action")
    async def desktop_flight_action(
        flight_id: str, body: DesktopFlightAction,
        link: dict = Depends(bridge_user)
    ):
        if flight_ops is None:
            raise HTTPException(status_code=503, detail="Desktop operations unavailable")
        # The shared flight operations enforce existing ownership, edit locks,
        # close-flight validation and Pydantic field validators.
        result = await flight_ops(
            link["user_id"], flight_id, body.action, body.payload)
        return {"flight": result.model_dump()}

    @r.get("/desktop/metar/{icao}")
    async def desktop_metar(icao: str, link: dict = Depends(bridge_user)):
        if not re.fullmatch(r"[A-Za-z]{4}", icao):
            raise HTTPException(status_code=400, detail="Invalid airport ICAO")
        try:
            response = await run_in_threadpool(
                requests.get, "https://aviationweather.gov/api/data/metar",
                params={"ids": icao.upper(), "format": "raw"}, timeout=8)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="METAR service unavailable")
        if response.status_code == 204:
            return {"icao": icao.upper(), "metar": None}
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="METAR service unavailable")
        return {"icao": icao.upper(), "metar": response.text[:5000].strip() or None}

    @r.get("/desktop/reports/{flight_id}")
    async def desktop_report_pdf(flight_id: str,
                                 link: dict = Depends(bridge_user)):
        f = await db.flights.find_one(
            {"id": flight_id, "user_id": link["user_id"]}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Flight not found")
        if f.get("status") != "closed":
            raise HTTPException(status_code=409, detail="Close the flight before downloading the signed report")
        data = await run_in_threadpool(build_report_pdf, f)
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=NavdeckReport.pdf"})

    # Read-only desktop clients use the existing revocable pairing token. All
    # queries are scoped to the user who created the token. The desktop never
    # receives Clerk credentials or a direct database connection.
    @r.get("/desktop/flights")
    async def desktop_flights(link: dict = Depends(bridge_user)):
        docs = await db.flights.find(
            {"user_id": link["user_id"]},
            {"_id": 0, "id": 1, "callsign": 1, "origin": 1,
             "destination": 1, "aircraft": 1, "status": 1,
             "imported_at": 1, "distance": 1, "ete": 1,
             "landing_rate": 1, "times": 1}
        ).sort("imported_at", -1).to_list(100)
        return {"flights": docs}

    @r.get("/desktop/logbook")
    async def desktop_logbook(link: dict = Depends(bridge_user)):
        docs = await db.flights.find(
            {"user_id": link["user_id"], "status": "closed"},
            {"_id": 0, "id": 1, "callsign": 1, "origin": 1,
             "destination": 1, "aircraft": 1, "closed_at": 1,
             "landing_rate": 1, "times": 1}
        ).sort("closed_at", -1).to_list(200)
        return {"flights": docs}

    @r.get("/desktop/profile")
    async def desktop_profile(link: dict = Depends(bridge_user)):
        p = await db.pilots.find_one({"user_id": link["user_id"]}, {"_id": 0,
            "simbrief_pilot_id": 1, "display_name": 1,
            "vatsim_cid": 1, "vatsim_friends": 1})
        return {"profile": p or {}}

    @r.put("/desktop/profile")
    async def desktop_update_profile(body: DesktopPilotUpdate,
                                     link: dict = Depends(bridge_user)):
        update = body.model_dump(exclude_unset=True)
        if "display_name" in update and update["display_name"] is not None:
            update["display_name"] = update["display_name"].strip() or None
        if "simbrief_pilot_id" in update and update["simbrief_pilot_id"] == "":
            update["simbrief_pilot_id"] = None
        if "vatsim_friends" in update and update["vatsim_friends"] is not None:
            friends = list(dict.fromkeys(
                str(x).strip().upper() for x in update["vatsim_friends"]))
            if any(not re.fullmatch(r"[A-Z0-9_-]{2,12}", x) for x in friends):
                raise HTTPException(status_code=400, detail="Invalid VATSIM friend identifier")
            update["vatsim_friends"] = friends
        if update:
            update["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.pilots.update_one({"user_id": link["user_id"]},
                {"$set": update}, upsert=True)
        return await desktop_profile(link)

    @r.post("/desktop/import")
    async def desktop_import_flight(body: Optional[DesktopImportRequest] = None,
                                    link: dict = Depends(bridge_user)):
        if simbrief_import is None:
            raise HTTPException(status_code=503, detail="SimBrief import not configured")
        flight = await simbrief_import(link["user_id"], body.pilot_id if body else None)
        return {"flight": {k: getattr(flight, k, None) for k in
            ("id", "callsign", "origin", "destination", "aircraft")}}

    @r.delete("/desktop/session")
    async def revoke_desktop_session(link: dict = Depends(bridge_user)):
        # Revoke only the credential held by this Windows app, not every
        # simulator linked to the Clerk account. A deleted token cannot be
        # reused after the desktop user signs out.
        await db.bridge_links.delete_one({"token_hash": link["token_hash"]})
        return {"ok": True}

    @r.post("/link")
    async def create_link(user: dict = Depends(require_user)):
        token = secrets.token_urlsafe(32)
        await db.bridge_links.delete_many({"user_id": user["user_id"]})
        await db.bridge_links.insert_one({"user_id": user["user_id"], "token_hash": _hash(token), "created_at": datetime.now(timezone.utc).isoformat(),
                                          "last_seen": None, "sim": None, "aircraft": None, "flight_id": None, "version": 0, "last_event": None})
        return {"token": token}

    @r.delete("/link")
    async def delete_link(user: dict = Depends(require_user)):
        await db.bridge_links.delete_many({"user_id": user["user_id"]})
        return {"ok": True}

    @r.get("/status")
    async def status(user: dict = Depends(require_user)):
        link = await db.bridge_links.find_one({"user_id": user["user_id"]}, {"_id": 0, "token_hash": 0})
        if not link:
            return {"paired": False}
        f = await target_flight(link)
        online = bool(link.get("last_seen")) and (datetime.now(timezone.utc) - datetime.fromisoformat(link["last_seen"])).total_seconds() < 90 and link.get("connected", True)
        return link | {"paired": True, "online": online, "flight_id": f["id"] if f else None,
                       "flight": f"{f.get('callsign')} {f.get('origin')}→{f.get('destination')}" if f else None}

    @r.put("/target")
    async def set_target(body: BridgeTarget, user: dict = Depends(require_user)):
        f = await db.flights.find_one({"id": body.flight_id, "user_id": user["user_id"], "status": {"$ne": "closed"}}, {"_id": 0, "id": 1})
        if not f:
            raise HTTPException(status_code=404, detail="Open flight not found")
        res = await db.bridge_links.update_one({"user_id": user["user_id"]}, {"$set": {"flight_id": body.flight_id}})
        if not res.matched_count:
            raise HTTPException(status_code=400, detail="Link your simulator first")
        return {"ok": True}

    @r.get("/flight")
    async def bridge_flight(link: dict = Depends(bridge_user)):
        f = await target_flight(link)
        if not f:
            return {"flight": None}
        wps = [{"index": i, "ident": w["ident"], "lat": w.get("lat"), "lon": w.get("lon"), "done": bool(w.get("passed") or w.get("ata") or w.get("skipped"))}
               for i, w in enumerate(f.get("waypoints") or [])]
        return {"flight": {k: f.get(k) for k in ("id", "callsign", "origin", "destination", "aircraft")} | {"times": f.get("times") or {}, "landing_rate": f.get("landing_rate"), "waypoints": wps}}

    @r.post("/waypoint")
    async def waypoint_passed(body: BridgeWaypoint, link: dict = Depends(bridge_user)):
        f = await target_flight(link)
        if not f:
            raise HTTPException(status_code=409, detail="No open flight in NAVDECK to fill in")
        wps = f.get("waypoints") or []
        if body.index >= len(wps) or wps[body.index]["ident"] != body.ident:
            raise HTTPException(status_code=404, detail="Waypoint not found in the NAVDECK flight")
        wp, applied = wps[body.index], []
        if wp.get("skipped"):
            return {"applied": []}
        if not wp.get("ata"):
            wp["ata"] = body.time
            applied.append("ata")
        if body.fuel_lb is not None and not wp.get("actual_fob"):
            units = (f.get("weights") or {}).get("ofp_units", "KG")
            wp["actual_fob"] = str(round(body.fuel_lb if units == "LB" else body.fuel_lb / LB_PER_KG))
            applied.append("actual_fob")
        if body.altitude_ft is not None and not wp.get("actual_alt"):
            wp["actual_alt"] = str(round(body.altitude_ft))
            applied.append("actual_alt")
        wp["passed"] = True
        await db.flights.update_one({"id": f["id"]}, {"$set": {"waypoints": wps}})
        now = datetime.now(timezone.utc).isoformat()
        await db.bridge_links.update_one({"token_hash": link["token_hash"]}, {"$set": {"last_seen": now, "last_event": {"type": "waypoint", "ident": body.ident, "time": body.time, "applied": applied, "at": now}},
                                                                           "$inc": {"version": 1}})
        return {"applied": applied}

    @r.post("/heartbeat")
    async def heartbeat(body: BridgeHeartbeat, link: dict = Depends(bridge_user)):
        await db.bridge_links.update_one({"token_hash": link["token_hash"]}, {"$set": body.model_dump() | {"last_seen": datetime.now(timezone.utc).isoformat()}})
        return {"ok": True}

    @r.post("/event")
    async def event(body: BridgeEvent, link: dict = Depends(bridge_user)):
        f = await target_flight(link)
        if not f:
            raise HTTPException(status_code=409, detail="No open flight in NAVDECK to fill in")
        times = f.get("times") or {}
        update, applied = {}, []
        if not times.get(body.type):
            update[f"times.{body.type}"] = body.time
            applied.append(body.type)
        if body.type == "landing" and body.landing_rate is not None and not f.get("landing_rate"):
            update["landing_rate"] = str(round(body.landing_rate))
            applied.append("landing_rate")
        if body.type == "on" and body.fuel_lb is not None and not f.get("arrival_fob"):
            units = (f.get("weights") or {}).get("ofp_units", "KG")
            update["arrival_fob"] = str(round(body.fuel_lb if units == "LB" else body.fuel_lb / LB_PER_KG))
            applied.append("arrival_fob")
        if update:
            await db.flights.update_one({"id": f["id"]}, {"$set": update})
        now = datetime.now(timezone.utc).isoformat()
        await db.bridge_links.update_one({"token_hash": link["token_hash"]}, {"$set": {"last_seen": now, "last_event": {"type": body.type, "time": body.time, "applied": applied, "at": now}},
                                                                           "$inc": {"version": 1}})
        return {"flight_id": f["id"], "applied": applied}

    return r
