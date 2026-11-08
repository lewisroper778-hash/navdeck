"""Insert a synthetic flight for a clerk test user to exercise toggle/reset/delete endpoints."""
import requests, uuid, json, asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

BASE = "https://navlog-pilot--0t7q144t.preview.emergentagent.com"
CLERK_SECRET = "sk_test_lX7tqBNVTkjHEb3WAX5D8IIlt4YNZaqkMwtE93HJVC"
CLERK_API = "https://api.clerk.com/v1"
HDRS = {"Authorization": f"Bearer {CLERK_SECRET}", "User-Agent": "e-navlog-tester/1.0",
        "Content-Type": "application/json"}

def create_user(email):
    r = requests.post(f"{CLERK_API}/users", headers=HDRS, json={
        "email_address": [email], "password": "TestPass!xyz12345",
        "skip_password_checks": True}, timeout=30)
    r.raise_for_status()
    return r.json()["id"]

def create_token(uid):
    r = requests.post(f"{CLERK_API}/sessions", headers=HDRS, json={"user_id": uid}, timeout=30)
    r.raise_for_status()
    sid = r.json()["id"]
    r2 = requests.post(f"{CLERK_API}/sessions/{sid}/tokens", headers=HDRS, json={}, timeout=30)
    r2.raise_for_status()
    return r2.json()["jwt"]

def delete_user(uid):
    requests.delete(f"{CLERK_API}/users/{uid}", headers=HDRS, timeout=15)

async def insert_flight(user_id, flight_id):
    cli = AsyncIOMotorClient("mongodb://localhost:27017")
    db = cli["test_database"]
    doc = {
        "id": flight_id, "user_id": user_id,
        "callsign": "TEST_FLT1", "aircraft": "B738",
        "origin": "KJFK", "destination": "KLAX",
        "waypoints": [
            {"ident": "WPT1", "passed": False},
            {"ident": "WPT2", "passed": False},
        ],
        "fuel": {}, "imported_at": datetime.now(timezone.utc).isoformat()
    }
    await db.flights.insert_one(doc)
    cli.close()

async def cleanup(user_id):
    cli = AsyncIOMotorClient("mongodb://localhost:27017")
    db = cli["test_database"]
    await db.flights.delete_many({"user_id": user_id})
    await db.pilots.delete_many({"user_id": user_id})
    cli.close()

results = {"passed": [], "failed": []}
def P(n, d=""): print(f"PASS: {n} {d}"); results["passed"].append(n)
def F(n, d): print(f"FAIL: {n} :: {d}"); results["failed"].append({"name":n,"detail":d})

suffix = uuid.uuid4().hex[:6]
emailA = f"test_a_{suffix}+clerk_test@example.com"
emailB = f"test_b_{suffix}+clerk_test@example.com"
uidA = create_user(emailA); uidB = create_user(emailB)
tokA = create_token(uidA); tokB = create_token(uidB)
HA = {"Authorization": f"Bearer {tokA}"}
HB = {"Authorization": f"Bearer {tokB}"}

fid = str(uuid.uuid4())
try:
    asyncio.run(insert_flight(uidA, fid))
    print(f"Inserted TEST_ flight {fid} for {uidA}")

    # Cross-user GET -> 404
    r = requests.get(f"{BASE}/api/flights/{fid}", headers=HB, timeout=15)
    if r.status_code == 404: P("cross-user GET flight -> 404")
    else: F("cross-user GET flight", f"{r.status_code}")

    # Toggle waypoint
    r = requests.post(f"{BASE}/api/flights/{fid}/waypoint", headers=HA,
                      json={"ident": "WPT1", "passed": True}, timeout=15)
    if r.ok and any(w["ident"]=="WPT1" and w["passed"] for w in r.json()["waypoints"]):
        P("POST /waypoint toggles passed=true")
    else: F("POST /waypoint", f"{r.status_code} {r.text[:120]}")

    # Reset
    r = requests.post(f"{BASE}/api/flights/{fid}/reset", headers=HA, timeout=15)
    if r.ok and all(not w["passed"] for w in r.json()["waypoints"]):
        P("POST /reset clears passed flags")
    else: F("POST /reset", f"{r.status_code}")

    # Delete
    r = requests.delete(f"{BASE}/api/flights/{fid}", headers=HA, timeout=15)
    r2 = requests.get(f"{BASE}/api/flights/{fid}", headers=HA, timeout=15)
    if r.ok and r2.status_code == 404: P("DELETE + GET -> 404")
    else: F("DELETE flight", f"del={r.status_code} get={r2.status_code}")
finally:
    asyncio.run(cleanup(uidA))
    asyncio.run(cleanup(uidB))
    delete_user(uidA); delete_user(uidB)

print(json.dumps(results, indent=2))
with open("/tmp/test_results2.json","w") as f: json.dump(results,f)
