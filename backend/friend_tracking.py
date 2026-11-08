import uuid
from datetime import datetime, timedelta, timezone

from starlette.concurrency import run_in_threadpool

try:
    from vatsim_atc import airport_coords, nm_between
except ModuleNotFoundError:
    from backend.vatsim_atc import airport_coords, nm_between

LANDED_NM = 15
DISCONNECT_NM = 40


async def enrich(p: dict, now: datetime) -> dict:
    dep, arr = await run_in_threadpool(airport_coords, p["dep"]), await run_in_threadpool(airport_coords, p["arr"])
    remaining = round(nm_between((p["lat"], p["lon"]), arr)) if arr else None
    total = nm_between(dep, arr) if dep and arr else None
    eta = (now + timedelta(hours=remaining / p["gs"])).isoformat() if remaining is not None and p["gs"] > 50 else None
    progress = round(max(0, min(1, 1 - remaining / total)) * 100) if total else None
    return p | {"remaining_nm": remaining, "eta": eta, "progress": progress, "on_ground": p["gs"] < 50}


def _landing_time(prev: dict, now: datetime) -> str:
    # Between checks we only know it landed after the last airborne sighting; prefer that sighting's ETA
    seen = datetime.fromisoformat(prev["updated_at"])
    eta = datetime.fromisoformat(prev["eta"]) if prev.get("eta") else now
    return min(max(eta, seen), now).isoformat()


async def track(db, user_id: str, friends: list, pilots: list) -> list:
    now = datetime.now(timezone.utc)
    online = [await enrich(p, now) for p in pilots if str(p["cid"]) in friends or p["callsign"] in friends]
    prev = {t["cid"]: t async for t in db.friend_tracks.find({"user_id": user_id}, {"_id": 0})}
    landings = []
    for p in online:
        old = prev.pop(p["cid"], None)
        if old and old["state"] == "air" and p["on_ground"] and p["remaining_nm"] is not None and p["remaining_nm"] <= LANDED_NM:
            landings.append(old | {"landed_at": _landing_time(old, now)})
        await db.friend_tracks.update_one({"user_id": user_id, "cid": p["cid"]}, {"$set": {
            "user_id": user_id, "cid": p["cid"], "callsign": p["callsign"], "dep": p["dep"], "arr": p["arr"], "aircraft": p["aircraft"],
            "state": "ground" if p["on_ground"] else "air", "remaining_nm": p["remaining_nm"], "eta": p["eta"], "updated_at": now.isoformat()}}, upsert=True)
    for old in prev.values():
        if old["state"] == "air" and old.get("remaining_nm") is not None and old["remaining_nm"] <= DISCONNECT_NM:
            landings.append(old | {"landed_at": _landing_time(old, now)})
        await db.friend_tracks.delete_one({"user_id": user_id, "cid": old["cid"]})
    for l in landings:
        await db.friend_landings.insert_one({"id": str(uuid.uuid4()), "user_id": user_id, "cid": l["cid"], "callsign": l["callsign"],
                                             "dep": l["dep"], "arr": l["arr"], "aircraft": l.get("aircraft"), "landed_at": l["landed_at"],
                                             "detected_at": now.isoformat(), "seen": False})
    return online
