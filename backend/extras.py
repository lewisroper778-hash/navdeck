import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

try:
    from backend.clerk_auth import require_user
    from backend.pdf_report import APP_NAME, build_report_pdf, get_object, put_object
except ModuleNotFoundError:
    from clerk_auth import require_user
    from pdf_report import APP_NAME, build_report_pdf, get_object, put_object

AI_MODEL = "gpt-5.4"
_vatsim_cache = {"at": 0, "data": None}


class NotesUpdate(BaseModel):
    metar: Optional[str] = None
    runway: Optional[str] = None
    notes: Optional[str] = None


class AiRequest(BaseModel):
    message: Optional[str] = None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _minutes(a, b):
    if not a or not b:
        return 0
    ah, am = map(int, a.split(":"))
    bh, bm = map(int, b.split(":"))
    return ((bh * 60 + bm) - (ah * 60 + am)) % 1440


def _flight_context(f: dict) -> str:
    t, fuel, w = f.get("times") or {}, f.get("fuel") or {}, f.get("weights") or {}
    fixes = ", ".join(f"{p.get('ident')}{'(ATA ' + p['ata'] + ')' if p.get('ata') else ''}" for p in (f.get("waypoints") or [])[:60])
    return (
        f"Flight {f.get('callsign')} {f.get('aircraft')} {f.get('origin')} ({f.get('origin_name')}) to {f.get('destination')} "
        f"({f.get('destination_name')}), alternate {f.get('alternate')}. Cruise {f.get('cruise_level')} ft, distance {f.get('distance')} nm, "
        f"ETE {int(_num(f.get('ete')) or 0) // 60} min. Route: {f.get('route')}. Fuel ({w.get('ofp_units', 'KG')}): block {fuel.get('block')}, "
        f"trip {fuel.get('trip')}, min takeoff {fuel.get('min_takeoff')}, contingency {fuel.get('contingency')}, alternate {fuel.get('alternate')}, "
        f"final reserve {fuel.get('reserve')}, extra {fuel.get('extra')}. Weights: ZFW {w.get('zfw')}/{w.get('max_zfw')}, TOW {w.get('tow')}/{w.get('max_tow')}, "
        f"LAW {w.get('law')}/{w.get('max_law')}, pax {w.get('pax_count')}. Times UTC: sched out {t.get('sched_off')}, gate out {t.get('off')}, "
        f"takeoff {t.get('takeoff')}, landing {t.get('landing')}, gate in {t.get('on')}, TSAT {t.get('tsat')}, CTOT {t.get('ctot')}. "
        f"Landing rate {f.get('landing_rate')} fpm. Fuel at gate {f.get('arrival_fob')}. Arrival notes: {f.get('arrival_notes')}. Fixes: {fixes}."
    )


PROMPTS = {
    "briefing": "Write a concise pre-flight crew briefing (max 220 words) with short headed sections: Route, Fuel, Weights, Slot/Timing, Threats. Use the figures given.",
    "debrief": "Write a short post-flight debrief (max 200 words): punctuality vs schedule, landing rate quality, fuel used vs plan, and 2-3 concrete tips to improve.",
    "metar": "Decode this METAR/ATIS for a pilot in plain English (max 120 words): wind and likely runway in use with crosswind remarks, visibility, cloud, temperature, QNH, and any hazards.",
}


def build_router(db, owned_flight, editable_flight) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.post("/presence")
    async def heartbeat(user: dict = Depends(require_user)):
        await db.presence.update_one({"user_id": user["user_id"]}, {"$set": {"last_seen": datetime.now(timezone.utc)}}, upsert=True)
        return await online_count()

    @r.get("/presence")
    async def online_count():
        since = datetime.now(timezone.utc) - timedelta(minutes=2)
        return {"online": await db.presence.count_documents({"last_seen": {"$gte": since}})}

    @r.get("/stats")
    async def stats(user: dict = Depends(require_user)):
        flights = await db.flights.find({"user_id": user["user_id"]}, {"_id": 0, "waypoints": 0}).to_list(1000)
        closed = [f for f in flights if f.get("status") == "closed"]
        rates = [abs(_num(f.get("landing_rate"))) for f in closed if _num(f.get("landing_rate")) is not None]
        block = sum(_minutes((f.get("times") or {}).get("off"), (f.get("times") or {}).get("on")) for f in closed)
        air = sum(_minutes((f.get("times") or {}).get("takeoff"), (f.get("times") or {}).get("landing")) for f in closed)
        return {
            "flights_total": len(flights), "flights_closed": len(closed), "block_minutes": block, "air_minutes": air,
            "landings": len(rates), "avg_landing_rate": round(sum(rates) / len(rates)) if rates else None,
            "best_landing_rate": round(min(rates)) if rates else None,
            "distance_nm": sum(int(_num(f.get("distance")) or 0) for f in closed),
        }

    @r.get("/logbook")
    async def logbook(user: dict = Depends(require_user)):
        flights = await db.flights.find({"user_id": user["user_id"], "status": "closed"}, {"_id": 0, "waypoints": 0}).sort("closed_at", -1).to_list(1000)
        docs = {d["flight_id"]: d["id"] async for d in db.documents.find({"user_id": user["user_id"], "is_deleted": False}, {"_id": 0})}
        out = []
        for f in flights:
            t = f.get("times") or {}
            out.append({k: f.get(k) for k in ("id", "callsign", "airline_icao", "aircraft", "origin", "destination", "distance", "landing_rate", "closed_at")}
                       | {"block_minutes": _minutes(t.get("off"), t.get("on")), "air_minutes": _minutes(t.get("takeoff"), t.get("landing")),
                          "off": t.get("off"), "on": t.get("on"), "document_id": docs.get(f["id"])})
        return out

    @r.get("/documents")
    async def documents(user: dict = Depends(require_user)):
        return await db.documents.find({"user_id": user["user_id"], "is_deleted": False}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)

    @r.get("/documents/{doc_id}/file")
    async def document_file(doc_id: str, user: dict = Depends(require_user)):
        d = await db.documents.find_one({"id": doc_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Document not found")
        data = await run_in_threadpool(get_object, d["storage_path"])
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{d["filename"]}"'})

    @r.get("/vatsim/pilots")
    async def vatsim_pilots():
        if not _vatsim_cache["data"] or time.time() - _vatsim_cache["at"] > 20:
            try:
                resp = await run_in_threadpool(requests.get, "https://data.vatsim.net/v3/vatsim-data.json", timeout=15)
                feed = resp.json()
            except (requests.RequestException, ValueError):
                if _vatsim_cache["data"]:
                    return _vatsim_cache["data"]
                raise HTTPException(status_code=502, detail="VATSIM data feed unavailable")
            pilots = [{"cid": p["cid"], "callsign": p["callsign"], "lat": p["latitude"], "lon": p["longitude"], "alt": p["altitude"],
                       "gs": p["groundspeed"], "hdg": p["heading"], "name": p.get("name"),
                       "dep": (p.get("flight_plan") or {}).get("departure"), "arr": (p.get("flight_plan") or {}).get("arrival"),
                       "aircraft": (p.get("flight_plan") or {}).get("aircraft_short")} for p in feed.get("pilots", [])]
            _vatsim_cache.update(at=time.time(), data={"updated": feed.get("general", {}).get("update_timestamp"), "pilots": pilots,
                                                      "controllers": len(feed.get("controllers", []))})
        return _vatsim_cache["data"]

    @r.get("/vatsim/member/{cid}")
    async def vatsim_member(cid: str, user: dict = Depends(require_user)):
        if not cid.isdigit():
            raise HTTPException(status_code=400, detail="CID must be numeric")
        try:
            resp = await run_in_threadpool(requests.get, f"https://api.vatsim.net/v2/members/{cid}", timeout=10)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="VATSIM member service unavailable")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="VATSIM member not found")
        try:
            resp.raise_for_status()
            m = resp.json()
        except (requests.HTTPError, ValueError):
            raise HTTPException(status_code=502, detail="VATSIM member service unavailable")
        feed = await vatsim_pilots()
        live = next((p for p in feed["pilots"] if str(p["cid"]) == cid), None)
        return {"cid": cid, "rating": m.get("rating"), "pilotrating": m.get("pilotrating"), "region": m.get("region_id"),
                "division": m.get("division_id"), "reg_date": m.get("reg_date"), "online": live}

    @r.get("/metar/{icao}")
    async def metar(icao: str, user: dict = Depends(require_user)):
        if not (icao.isalnum() and len(icao) == 4):
            raise HTTPException(status_code=400, detail="ICAO code must be 4 characters")
        try:
            resp = await run_in_threadpool(requests.get, f"https://aviationweather.gov/api/data/metar?ids={icao.upper()}&format=raw", timeout=10)
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="Weather service unavailable, try again shortly")
        if resp.status_code == 204:
            return {"icao": icao.upper(), "metar": None}
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Weather service unavailable, try again shortly")
        return {"icao": icao.upper(), "metar": resp.text.strip() or None}

    @r.patch("/flights/{flight_id}/notes")
    async def update_notes(flight_id: str, body: NotesUpdate, user: dict = Depends(require_user)):
        doc = await editable_flight(flight_id, user["user_id"])
        notes = (doc.get("arrival_notes") or {}) | {k: (v or None) for k, v in body.model_dump(exclude_unset=True).items()}
        await db.flights.update_one({"id": flight_id}, {"$set": {"arrival_notes": notes}})
        return doc | {"arrival_notes": notes}

    @r.get("/ai/{flight_id}/chat")
    async def chat_history(flight_id: str, user: dict = Depends(require_user)):
        await owned_flight(flight_id, user["user_id"])
        return await db.ai_messages.find({"flight_id": flight_id, "user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)

    @r.post("/ai/{flight_id}/{mode}")
    async def ai(flight_id: str, mode: str, body: AiRequest, user: dict = Depends(require_user)):
        f = await owned_flight(flight_id, user["user_id"])
        if mode not in (*PROMPTS, "chat"):
            raise HTTPException(status_code=404, detail="Unknown AI mode")
        system = "You are NAVDECK Co-pilot, an experienced airline first officer helping a flight-simulator pilot. Be concise and practical. This is for simulation only. Reply in plain text only: no markdown, no asterisks or hash symbols; use short CAPITALISED headings followed by a colon when you need sections."
        context = _flight_context(f)
        if mode == "chat":
            if not (body.message or "").strip():
                raise HTTPException(status_code=400, detail="Message is required")
            history = await db.ai_messages.find({"flight_id": flight_id, "user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(12)
            convo = "\n".join(f"{m['role']}: {m['text']}" for m in reversed(history))
            prompt = f"{context}\n\nConversation so far:\n{convo}\n\nPilot: {body.message}"
        elif mode == "metar":
            if not (body.message or (f.get("arrival_notes") or {}).get("metar")):
                raise HTTPException(status_code=400, detail="Add or fetch a METAR/ATIS first")
            prompt = f"{PROMPTS['metar']}\nArrival airport {f.get('destination')}. METAR/ATIS: {body.message or (f.get('arrival_notes') or {}).get('metar') or 'not provided'}"
        else:
            prompt = f"{PROMPTS[mode]}\n\n{context}"
        llm = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"{flight_id}-{mode}-{uuid.uuid4()}", system_message=system).with_model("openai", AI_MODEL)

        async def stream():
            text = ""
            try:
                async for ev in llm.stream_message(UserMessage(text=prompt)):
                    if isinstance(ev, TextDelta):
                        text += ev.content
                        yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as e:  # surface provider errors to the UI instead of a silent hang
                yield f"data: {json.dumps({'error': str(e)[:200]})}\n\n"
                return
            now = datetime.now(timezone.utc).isoformat()
            if mode == "chat":
                await db.ai_messages.insert_many([
                    {"flight_id": flight_id, "user_id": user["user_id"], "role": "pilot", "text": body.message, "created_at": now},
                    {"flight_id": flight_id, "user_id": user["user_id"], "role": "copilot", "text": text, "created_at": now + "z"},
                ])
            else:
                await db.flights.update_one({"id": flight_id}, {"$set": {f"ai.{mode}": text}})
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return r


async def store_report(db, f: dict) -> dict:
    data = await run_in_threadpool(build_report_pdf, f)
    path = f"{APP_NAME}/reports/{f['user_id']}/{uuid.uuid4()}.pdf"
    res = await run_in_threadpool(put_object, path, data, "application/pdf")
    rec = {"id": str(uuid.uuid4()), "user_id": f["user_id"], "flight_id": f["id"], "storage_path": res["path"], "size": res.get("size"),
           "filename": f"NAVDECK_{f.get('callsign') or 'FLT'}_{f.get('origin')}-{f.get('destination')}.pdf",
           "title": f"{f.get('callsign') or ''} {f.get('origin')} → {f.get('destination')}", "is_deleted": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.documents.update_many({"flight_id": f["id"], "user_id": f["user_id"]}, {"$set": {"is_deleted": True}})
    await db.documents.insert_one(dict(rec))
    return rec
