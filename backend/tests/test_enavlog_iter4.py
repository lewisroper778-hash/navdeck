"""e-navlog iteration 4 backend retests: closed-flight 409 locking, HH:MM/numeric validation (422), index-based waypoint edits, ATA clear -> passed=false."""
import pytest


@pytest.fixture(scope="module")
def flight(other_user, base_url):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def _u(base_url, fid, p=""):
    return f"{base_url}/api/flights/{fid}{p}"


# Validation: HH:MM times -> 422
@pytest.mark.parametrize("bad", ["25:99", "24:00", "9:5", "abc", "12:60", "1200"])
def test_times_invalid_422(other_user, base_url, flight, bad):
    r = other_user.patch(_u(base_url, flight["id"], "/times"), json={"off": bad}, timeout=15)
    assert r.status_code == 422, f"{bad} -> {r.status_code}"


def test_times_valid_and_clear(other_user, base_url, flight):
    fid = flight["id"]
    r = other_user.patch(_u(base_url, fid, "/times"), json={"tsat": "23:59", "ctot": "00:00"}, timeout=15)
    assert r.status_code == 200 and r.json()["times"]["tsat"] == "23:59" and r.json()["times"]["ctot"] == "00:00"
    r = other_user.patch(_u(base_url, fid, "/times"), json={"tsat": ""}, timeout=15)
    assert r.status_code == 200 and r.json()["times"]["tsat"] is None


# Validation: numeric landing_rate / arrival_fob / actual_fob / ATA
def test_numeric_validation(other_user, base_url, flight):
    fid = flight["id"]
    wp = flight["waypoints"][0]["ident"]
    for body in ({"landing_rate": "abc"}, {"landing_rate": "1-2"}, {"arrival_fob": "12kg"}):
        assert other_user.patch(_u(base_url, fid, "/arrival"), json=body, timeout=15).status_code == 422, body
    for body in ({"actual_fob": "x1"}, {"actual_fob": "null"}, {"ata": "25:99"}):
        r = other_user.patch(_u(base_url, fid, "/waypoint-log"), json={"ident": wp, "index": 0, **body}, timeout=15)
        assert r.status_code == 422, body
    r = other_user.patch(_u(base_url, fid, "/arrival"), json={"landing_rate": "-145", "arrival_fob": "2100.5"}, timeout=15)
    assert r.status_code == 200 and r.json()["landing_rate"] == "-145"


# Index-based waypoint edits only change that row; mismatched index -> 404; clearing ATA -> passed false
def test_waypoint_index(other_user, base_url, flight):
    fid = flight["id"]
    wps = flight["waypoints"]
    idx = 1
    ident = wps[idx]["ident"]
    r = other_user.patch(_u(base_url, fid, "/waypoint-log"), json={"ident": ident, "index": idx, "ata": "10:30", "actual_fob": "4321"}, timeout=15)
    assert r.status_code == 200, r.text
    g = other_user.get(_u(base_url, fid), timeout=15).json()["waypoints"]
    assert g[idx]["ata"] == "10:30" and g[idx]["passed"] is True and g[idx]["actual_fob"] == "4321"
    others = [w for i, w in enumerate(g) if i != idx and w["ident"] == ident]
    assert all(not w["ata"] for w in others)
    # mismatch ident/index
    assert other_user.patch(_u(base_url, fid, "/waypoint-log"), json={"ident": "ZZZZZ", "index": idx, "ata": "10:00"}, timeout=15).status_code == 404
    assert other_user.patch(_u(base_url, fid, "/waypoint-log"), json={"ident": ident, "index": 9999, "ata": "10:00"}, timeout=15).status_code == 404
    assert other_user.post(_u(base_url, fid, "/waypoint"), json={"ident": ident, "index": 9999, "passed": True}, timeout=15).status_code == 404
    # toggle by index
    r = other_user.post(_u(base_url, fid, "/waypoint"), json={"ident": wps[0]["ident"], "index": 0, "passed": True}, timeout=15)
    assert r.status_code == 200 and r.json()["waypoints"][0]["passed"] is True
    # clear ATA -> passed false
    r = other_user.patch(_u(base_url, fid, "/waypoint-log"), json={"ident": ident, "index": idx, "ata": ""}, timeout=15)
    assert r.status_code == 200
    g = other_user.get(_u(base_url, fid), timeout=15).json()["waypoints"][idx]
    assert g["ata"] is None and g["passed"] is False and g["actual_fob"] == "4321"


# Closed flight locking: 409 on edits; units-only allowed; reopen restores editing
def test_closed_flight_locked(other_user, base_url, flight):
    fid = flight["id"]
    wp = flight["waypoints"][0]["ident"]
    other_user.patch(_u(base_url, fid, "/times"), json={"off": "10:00", "takeoff": "10:10", "landing": "11:40", "on": "11:50"}, timeout=15)
    other_user.patch(_u(base_url, fid, "/arrival"), json={"landing_rate": "-120"}, timeout=15)
    other_user.post(_u(base_url, fid, "/signoff"), json={"signed_by": "TEST_Capt"}, timeout=15)
    r = other_user.post(_u(base_url, fid, "/close"), timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "closed", r.text
    calls = (
        ("patch", "/times", {"off": "09:00"}),
        ("patch", "/arrival", {"landing_rate": "-50"}),
        ("patch", "/waypoint-log", {"ident": wp, "index": 0, "ata": "09:00"}),
        ("patch", "/actuals", {"pax_count": "5"}),
        ("patch", "/actuals", {"cargo": "5", "units": "LB"}),
        ("post", "/signoff", {"signed_by": "TEST_Other"}),
        ("post", "/waypoint", {"ident": wp, "index": 0, "passed": False}),
    )
    for m, p, body in calls:
        r = getattr(other_user, m)(_u(base_url, fid, p), json=body, timeout=15)
        assert r.status_code == 409, f"{m} {p} {body} -> {r.status_code}"
        assert "closed" in r.json()["detail"].lower()
    g = other_user.get(_u(base_url, fid), timeout=15).json()
    assert g["times"]["off"] == "10:00" and g["landing_rate"] == "-120" and g["signoff"]["signed_by"] == "TEST_Capt"
    r = other_user.patch(_u(base_url, fid, "/actuals"), json={"units": "LB"}, timeout=15)
    assert r.status_code == 200 and r.json()["weights"]["units"] == "LB" and r.json()["status"] == "closed"
    other_user.patch(_u(base_url, fid, "/actuals"), json={"units": "KG"}, timeout=15)
    r = other_user.post(_u(base_url, fid, "/reopen"), timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "open"
    r = other_user.patch(_u(base_url, fid, "/times"), json={"off": "09:00"}, timeout=15)
    assert r.status_code == 200 and r.json()["times"]["off"] == "09:00"


# Import idempotency (no duplicate)
def test_import_no_duplicate(other_user, base_url, flight):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.status_code == 200 and r.json()["id"] == flight["id"]
    lst = other_user.get(f"{base_url}/api/flights", timeout=15).json()
    assert sum(1 for f in lst if f["raw_simbrief_id"] == flight["raw_simbrief_id"]) == 1
