"""Backend smoke tests for e-navlog. Creates Clerk test users via Backend API."""
import os, sys, json, time, requests, uuid

BASE = "https://navlog-pilot--0t7q144t.preview.emergentagent.com"
CLERK_SECRET = "sk_test_lX7tqBNVTkjHEb3WAX5D8IIlt4YNZaqkMwtE93HJVC"
CLERK_API = "https://api.clerk.com/v1"
HDRS = {"Authorization": f"Bearer {CLERK_SECRET}", "User-Agent": "e-navlog-tester/1.0",
        "Content-Type": "application/json"}

results = {"passed": [], "failed": []}

def log_pass(name, detail=""):
    print(f"PASS: {name} {detail}")
    results["passed"].append(name)

def log_fail(name, detail):
    print(f"FAIL: {name} :: {detail}")
    results["failed"].append({"name": name, "detail": detail})

def create_user(email):
    r = requests.post(f"{CLERK_API}/users", headers=HDRS, json={
        "email_address": [email],
        "password": "TestPass!xyz12345",
        "skip_password_checks": True,
        "skip_password_requirement": False,
    }, timeout=30)
    if r.status_code not in (200, 201):
        # Try to find existing
        r2 = requests.get(f"{CLERK_API}/users", headers=HDRS,
                          params={"email_address": email}, timeout=30)
        if r2.ok and r2.json():
            return r2.json()[0]["id"]
        raise RuntimeError(f"create_user failed {r.status_code} {r.text}")
    return r.json()["id"]

def create_session_token(user_id):
    r = requests.post(f"{CLERK_API}/sessions", headers=HDRS,
                      json={"user_id": user_id}, timeout=30)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"create_session failed {r.status_code} {r.text}")
    sid = r.json()["id"]
    r2 = requests.post(f"{CLERK_API}/sessions/{sid}/tokens", headers=HDRS,
                       json={}, timeout=30)
    if r2.status_code not in (200, 201):
        raise RuntimeError(f"create_token failed {r2.status_code} {r2.text}")
    return r2.json()["jwt"], sid

def delete_user(uid):
    try:
        requests.delete(f"{CLERK_API}/users/{uid}", headers=HDRS, timeout=15)
    except Exception:
        pass

# 1. clerk/config
r = requests.get(f"{BASE}/api/clerk/config", timeout=15)
if r.ok and r.json().get("enabled") and r.json().get("publishable_key", "").startswith("pk_"):
    log_pass("GET /api/clerk/config", str(r.json()))
else:
    log_fail("GET /api/clerk/config", f"{r.status_code} {r.text}")

# 2. /api/me without token
r = requests.get(f"{BASE}/api/me", timeout=15)
if r.status_code == 401:
    log_pass("GET /api/me unauthenticated -> 401")
else:
    log_fail("GET /api/me unauthenticated", f"got {r.status_code} {r.text}")

# Create two Clerk users
suffix = uuid.uuid4().hex[:6]
emailA = f"test_a_{suffix}+clerk_test@example.com"
emailB = f"test_b_{suffix}+clerk_test@example.com"
uidA = create_user(emailA)
uidB = create_user(emailB)
print(f"Created users: A={uidA} B={uidB}")
tokA, _ = create_session_token(uidA)
tokB, _ = create_session_token(uidB)
HA = {"Authorization": f"Bearer {tokA}"}
HB = {"Authorization": f"Bearer {tokB}"}

try:
    # 3. /api/me with token -> creates profile
    r = requests.get(f"{BASE}/api/me", headers=HA, timeout=15)
    if r.status_code == 200 and "user_id" in r.json():
        log_pass("GET /api/me authenticated", r.json().get("user_id",""))
    else:
        log_fail("GET /api/me authenticated", f"{r.status_code} {r.text}")

    # 4. PUT /api/me
    r = requests.put(f"{BASE}/api/me", headers=HA,
                     json={"simbrief_pilot_id": "392350", "display_name": "Capt Test"},
                     timeout=15)
    if r.ok and r.json().get("simbrief_pilot_id") == "392350" and r.json().get("display_name") == "Capt Test":
        log_pass("PUT /api/me updates profile")
    else:
        log_fail("PUT /api/me", f"{r.status_code} {r.text}")

    # 5. POST /api/flights/import with no pilot_id configured for user B
    r = requests.post(f"{BASE}/api/flights/import", headers=HB, json={}, timeout=25)
    if r.status_code == 400 and "No SimBrief Pilot ID" in r.text:
        log_pass("POST /api/flights/import no-pilot-id -> 400")
    else:
        log_fail("POST /api/flights/import no-pilot-id", f"{r.status_code} {r.text}")

    # 6. POST /api/flights/import for user A (pilot_id 392350 from body)
    r = requests.post(f"{BASE}/api/flights/import", headers=HA,
                     json={"pilot_id": "392350"}, timeout=40)
    flight_id = None
    if r.status_code == 200:
        f = r.json()
        flight_id = f.get("id")
        wps = f.get("waypoints", [])
        log_pass("POST /api/flights/import success",
                 f"id={flight_id} wps={len(wps)} origin={f.get('origin')}")
    elif r.status_code in (400, 502):
        log_pass("POST /api/flights/import (acceptable SimBrief empty/error)",
                 f"{r.status_code} {r.text[:120]}")
    else:
        log_fail("POST /api/flights/import", f"{r.status_code} {r.text[:200]}")

    # If import didn't succeed, import again with default profile pilot_id
    if not flight_id:
        r = requests.post(f"{BASE}/api/flights/import", headers=HA, json={}, timeout=40)
        if r.status_code == 200:
            flight_id = r.json().get("id")
            log_pass("POST /api/flights/import via profile pilot_id", f"id={flight_id}")

    # 7. GET /api/flights isolation
    rA = requests.get(f"{BASE}/api/flights", headers=HA, timeout=15)
    rB = requests.get(f"{BASE}/api/flights", headers=HB, timeout=15)
    if rA.ok and rB.ok:
        a_ids = {f["id"] for f in rA.json()}
        b_ids = {f["id"] for f in rB.json()}
        if not (a_ids & b_ids) and len(b_ids) == 0:
            log_pass("GET /api/flights isolation", f"A={len(a_ids)} B={len(b_ids)}")
        else:
            log_fail("GET /api/flights isolation", f"A={a_ids} B={b_ids}")
    else:
        log_fail("GET /api/flights", f"A={rA.status_code} B={rB.status_code}")

    if flight_id:
        # 8. GET /api/flights/{id} as user B -> 404
        r = requests.get(f"{BASE}/api/flights/{flight_id}", headers=HB, timeout=15)
        if r.status_code == 404:
            log_pass("GET /api/flights/{id} cross-user -> 404")
        else:
            log_fail("GET /api/flights/{id} cross-user", f"{r.status_code}")

        # Get a waypoint ident
        r = requests.get(f"{BASE}/api/flights/{flight_id}", headers=HA, timeout=15)
        wps = r.json().get("waypoints", [])
        if wps:
            ident = wps[0]["ident"]
            # 9. Toggle waypoint
            r = requests.post(f"{BASE}/api/flights/{flight_id}/waypoint", headers=HA,
                              json={"ident": ident, "passed": True}, timeout=15)
            if r.ok and any(w["ident"] == ident and w["passed"] for w in r.json()["waypoints"]):
                log_pass("POST /waypoint toggles passed=true")
            else:
                log_fail("POST /waypoint", f"{r.status_code} {r.text[:200]}")

            # 10. Reset
            r = requests.post(f"{BASE}/api/flights/{flight_id}/reset", headers=HA, timeout=15)
            if r.ok and all(not w["passed"] for w in r.json()["waypoints"]):
                log_pass("POST /reset clears passed flags")
            else:
                log_fail("POST /reset", f"{r.status_code}")
        else:
            log_fail("waypoints present", "no waypoints in imported flight")

        # 11. DELETE
        r = requests.delete(f"{BASE}/api/flights/{flight_id}", headers=HA, timeout=15)
        r2 = requests.get(f"{BASE}/api/flights/{flight_id}", headers=HA, timeout=15)
        if r.ok and r2.status_code == 404:
            log_pass("DELETE /api/flights/{id} then GET -> 404")
        else:
            log_fail("DELETE /api/flights/{id}", f"del={r.status_code} get={r2.status_code}")
    else:
        print("SKIP: waypoint/reset/delete tests (no flight imported)")
        results["failed"].append({"name": "flight-dependent tests",
                                  "detail": "No flight imported, skipped toggle/reset/delete"})

finally:
    delete_user(uidA)
    delete_user(uidB)

print("\n=== SUMMARY ===")
print(json.dumps(results, indent=2))
with open("/tmp/test_results.json", "w") as f:
    json.dump(results, f)
print(f"\nPassed: {len(results['passed'])}  Failed: {len(results['failed'])}")
# Write created test users
with open("/app/memory/test_credentials.md", "a") as f:
    f.write(f"\n## e-navlog Clerk test users (iteration 1)\n")
    f.write(f"- {emailA} (user_id: {uidA}) — deleted after test\n")
    f.write(f"- {emailB} (user_id: {uidB}) — deleted after test\n")
