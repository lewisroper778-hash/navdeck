import hashlib
import re
import secrets
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

try:
    from backend.clerk_auth import require_user
except ModuleNotFoundError:
    from clerk_auth import require_user

LB_PER_KG = 2.20462


class BridgeEvent(BaseModel):
    type: Literal["off", "takeoff", "landing", "on"]
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    landing_rate: Optional[float] = Field(default=None, ge=0, le=5000)
    fuel_lb: Optional[float] = Field(default=None, ge=0, le=2_000_000)


class BridgeHeartbeat(BaseModel):
    sim: Optional[str] = Field(default=None, max_length=60)
    aircraft: Optional[str] = Field(default=None, max_length=120)
    connected: bool = True


class BridgeTarget(BaseModel):
    flight_id: str


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def build_bridge_router(db) -> APIRouter:
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
        return {"flight": {k: f.get(k) for k in ("id", "callsign", "origin", "destination", "aircraft")} | {"times": f.get("times") or {}, "landing_rate": f.get("landing_rate")}}

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
