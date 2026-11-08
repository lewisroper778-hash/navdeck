"""e-navlog iteration 3 backend tests: times (keep sched_*), waypoint-log, actuals units, arrival, close/reopen blockers, signoff/reset, import idempotency, isolation."""
import pytest
import requests


@pytest.fixture(scope="module")
def flight(other_user, base_url):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def _u(base_url, fid, p=""):
    return f"{base_url}/api/flights/{fid}{p}"


# Times: PATCH sets actuals without wiping sched_*
def test_times_keep_sched(other_user, base_url, flight):
    sched = {k: v for k, v in flight["times"].items() if k.startswith("sched_")}
    assert any(sched.values()), "no sched times parsed"
    r = other_user.patch(_u(base_url, flight["id"], "/times"), json={"off": "10:00", "tsat": "09:55", "ctot": "10:15"}, timeout=15)
    assert r.status_code == 200, r.text
    r = other_user.patch(_u(base_url, flight["id"], "/times"), json={"takeoff": "10:12"}, timeout=15)
    t = r.json()["times"]
    assert t["off"] == "10:00" and t["takeoff"] == "10:12" and t["tsat"] == "09:55" and t["ctot"] == "10:15"
    g = other_user.get(_u(base_url, flight["id"]), timeout=15).json()["times"]
    for k, v in sched.items():
        assert g[k] == v, f"{k} wiped"
    assert g["takeoff"] == "10:12"


# Waypoint log: ATA marks passed, FOB stored
def test_waypoint_log(other_user, base_url, flight):
    wp = flight["waypoints"][1]["ident"]
    r = other_user.patch(_u(base_url, flight["id"], "/waypoint-log"), json={"ident": wp, "ata": "10:30"}, timeout=15)
    assert r.status_code == 200
    r = other_user.patch(_u(base_url, flight["id"], "/waypoint-log"), json={"ident": wp, "actual_fob": "4321"}, timeout=15)
    g = other_user.get(_u(base_url, flight["id"]), timeout=15).json()
    w = next(x for x in g["waypoints"] if x["ident"] == wp)
    assert w["ata"] == "10:30" and w["passed"] is True and w["actual_fob"] == "4321"
    assert other_user.patch(_u(base_url, flight["id"], "/waypoint-log"), json={"ident": "ZZZZZ", "ata": "10:00"}, timeout=15).status_code == 404


# Actuals: unit change only changes weights.units
def test_actuals_units(other_user, base_url, flight):
    w0 = flight["weights"]
    r = other_user.patch(_u(base_url, flight["id"], "/actuals"), json={"pax_count": "120", "cargo": "1500", "units": "LB"}, timeout=15)
    assert r.status_code == 200
    w = other_user.get(_u(base_url, flight["id"]), timeout=15).json()["weights"]
    assert w["units"] == "LB" and w["ofp_units"] == w0["ofp_units"] == "KG"
    assert w["pax_count"] == "120" and w["cargo"] == "1500"
    for k in ("zfw", "tow", "law", "max_zfw", "max_tow", "max_law", "oew"):
        assert w[k] == w0[k], f"{k} changed on unit switch"
    other_user.patch(_u(base_url, flight["id"], "/actuals"), json={"units": "KG"}, timeout=15)
    w = other_user.get(_u(base_url, flight["id"]), timeout=15).json()["weights"]
    assert w["units"] == "KG"


# Close blocked until all items present
def test_close_blockers_then_close_reopen(other_user, base_url, flight):
    fid = flight["id"]
    other_user.post(_u(base_url, fid, "/reset"), timeout=15)
    r = other_user.post(_u(base_url, fid, "/close"), timeout=15)
    assert r.status_code == 400
    d = r.json()["detail"]
    for item in ("Left gate", "Takeoff", "Landing time", "Arrived at gate", "Landing rate", "Signed report"):
        assert item in d, f"{item} not in {d}"
    other_user.patch(_u(base_url, fid, "/times"), json={"off": "10:00", "takeoff": "10:10", "landing": "11:40", "on": "11:50"}, timeout=15)
    r = other_user.post(_u(base_url, fid, "/close"), timeout=15)
    assert r.status_code == 400 and "Landing rate" in r.json()["detail"] and "Left gate" not in r.json()["detail"]
    r = other_user.patch(_u(base_url, fid, "/arrival"), json={"landing_rate": "-120", "arrival_fob": "2100"}, timeout=15)
    assert r.status_code == 200 and r.json()["landing_rate"] == "-120" and r.json()["arrival_fob"] == "2100"
    r = other_user.post(_u(base_url, fid, "/close"), timeout=15)
    assert r.status_code == 400 and r.json()["detail"].endswith("Signed report")
    r = other_user.post(_u(base_url, fid, "/signoff"), json={"signed_by": "TEST_Capt", "remarks": "ok"}, timeout=15)
    assert r.status_code == 200 and r.json()["signoff"]["signed"] is True and r.json()["signoff"]["signed_at"]
    r = other_user.post(_u(base_url, fid, "/close"), timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "closed" and r.json()["closed_at"]
    g = other_user.get(_u(base_url, fid), timeout=15).json()
    assert g["status"] == "closed"
    r = other_user.post(_u(base_url, fid, "/reopen"), timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "open" and r.json()["closed_at"] is None
    assert other_user.get(_u(base_url, fid), timeout=15).json()["status"] == "open"


# Reset clears actuals but keeps sched_*
def test_reset_keeps_sched(other_user, base_url, flight):
    fid = flight["id"]
    other_user.patch(_u(base_url, fid, "/times"), json={"off": "10:00", "on": "12:00", "tsat": "09:50"}, timeout=15)
    other_user.patch(_u(base_url, fid, "/arrival"), json={"landing_rate": "-200"}, timeout=15)
    other_user.post(_u(base_url, fid, "/signoff"), json={"signed_by": "TEST_X"}, timeout=15)
    r = other_user.post(_u(base_url, fid, "/reset"), timeout=15)
    assert r.status_code == 200
    g = other_user.get(_u(base_url, fid), timeout=15).json()
    for k in ("off", "takeoff", "landing", "on", "tsat", "ctot"):
        assert g["times"][k] is None
    for k in ("sched_off", "sched_takeoff", "sched_landing", "sched_on"):
        assert g["times"][k] == flight["times"][k]
    assert g["landing_rate"] is None and g["arrival_fob"] is None
    assert g["signoff"]["signed"] is False and g["status"] == "open"
    assert all(not w["ata"] and not w["actual_fob"] and not w["passed"] for w in g["waypoints"])


# Import idempotency
def test_import_idempotent(other_user, base_url, flight):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.status_code == 200 and r.json()["id"] == flight["id"]
    lst = other_user.get(f"{base_url}/api/flights", timeout=15).json()
    assert sum(1 for f in lst if f["raw_simbrief_id"] == flight["raw_simbrief_id"]) == 1


# Isolation: pilot cannot touch other user's flight
def test_isolation(pilot_client, base_url, flight):
    fid = flight["id"]
    assert pilot_client.get(_u(base_url, fid), timeout=15).status_code == 404
    for m, p, body in (("patch", "/times", {"off": "01:00"}), ("patch", "/arrival", {"landing_rate": "1"}),
                       ("post", "/close", None), ("post", "/reopen", None), ("post", "/reset", None),
                       ("post", "/signoff", {"signed_by": "x"}), ("patch", "/actuals", {"units": "LB"}),
                       ("patch", "/waypoint-log", {"ident": flight["waypoints"][0]["ident"], "ata": "01:00"})):
        r = getattr(pilot_client, m)(_u(base_url, fid, p), json=body, timeout=15)
        assert r.status_code == 404, f"{m} {p} -> {r.status_code}"
    assert fid not in [f["id"] for f in pilot_client.get(f"{base_url}/api/flights", timeout=15).json()]


# Unauth endpoints
def test_unauth(base_url, flight):
    for p in ("/close", "/reopen", "/reset"):
        assert requests.post(_u(base_url, flight["id"], p), timeout=15).status_code == 401
    assert requests.patch(_u(base_url, flight["id"], "/arrival"), json={}, timeout=15).status_code == 401
