"""e-navlog iteration 2 backend tests: SimBrief import (LB/KG), dedupe, navlog logging, times, actuals, signoff, reset, isolation."""
import pytest
import requests
import re

HHMM = re.compile(r"^\d{2}:\d{2}$")


@pytest.fixture(scope="module")
def kg_flight(other_user, base_url):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


# Auth gating
def test_unauth_401(base_url):
    assert requests.get(f"{base_url}/api/flights", timeout=15).status_code == 401
    assert requests.post(f"{base_url}/api/flights/import", json={}, timeout=15).status_code == 401


# Import LB OFP via profile pilot ID + dedupe
def test_import_lb_and_dedupe(pilot_client, base_url):
    me = pilot_client.get(f"{base_url}/api/me", timeout=15).json()
    assert me["simbrief_pilot_id"] == "1"
    before = pilot_client.get(f"{base_url}/api/flights", timeout=15).json()
    r1 = pilot_client.post(f"{base_url}/api/flights/import", json={}, timeout=60)
    assert r1.status_code == 200, r1.text
    r2 = pilot_client.post(f"{base_url}/api/flights/import", json={}, timeout=60)
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    after = pilot_client.get(f"{base_url}/api/flights", timeout=15).json()
    ids = [f["raw_simbrief_id"] for f in after]
    assert len(ids) == len(set(ids)), f"duplicate OFP ids {ids}"
    assert len(after) <= len(before) + 1
    f = r1.json()
    assert f["origin"] == "KEWR" and f["destination"] == "EDDB"
    assert f["weights"]["units"] == "LB" and f["weights"]["ofp_units"] == "LB"
    assert f["airline_icao"]


def _check_parse(f):
    fu = f["fuel"]
    for k in ("taxi", "trip", "contingency", "alternate", "reserve", "block", "min_fuel", "mayday_fuel", "avg_burn_per_hour"):
        assert fu.get(k) not in (None, ""), f"fuel.{k} missing"
    assert int(fu["min_fuel"]) == int(float(fu["alternate"]) + float(fu["reserve"]))
    assert int(fu["mayday_fuel"]) == int(float(fu["reserve"]))
    w = f["weights"]
    for k in ("oew", "payload", "zfw", "tow", "law", "max_zfw", "max_tow", "max_law", "pax_count", "cargo", "pax_weight"):
        assert w.get(k) not in (None, ""), f"weights.{k} missing"
    t = f["times"]
    for k in ("sched_off", "sched_takeoff", "sched_landing", "sched_on"):
        assert t.get(k) and HHMM.match(t[k]), f"times.{k}={t.get(k)}"
    assert f["route"] and len(f["waypoints"]) > 3
    assert f["raw_simbrief_id"]


def test_parse_lb(pilot_client, base_url):
    f = pilot_client.post(f"{base_url}/api/flights/import", json={}, timeout=60).json()
    _check_parse(f)


def test_parse_kg(kg_flight):
    assert kg_flight["origin"] == "LEIB" and kg_flight["destination"] == "EGCC"
    assert kg_flight["weights"]["units"] == "KG"
    _check_parse(kg_flight)


def test_kg_dedupe(other_user, base_url, kg_flight):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "500000"}, timeout=60)
    assert r.json()["id"] == kg_flight["id"]
    assert len(other_user.get(f"{base_url}/api/flights", timeout=15).json()) == 1


# Waypoint log
def test_waypoint_log(other_user, base_url, kg_flight):
    fid = kg_flight["id"]
    ident = kg_flight["waypoints"][1]["ident"]
    r = other_user.patch(f"{base_url}/api/flights/{fid}/waypoint-log", json={"ident": ident, "ata": "10:15", "actual_fob": "500"}, timeout=15)
    assert r.status_code == 200
    g = other_user.get(f"{base_url}/api/flights/{fid}", timeout=15).json()
    wp = [w for w in g["waypoints"] if w["ident"] == ident][0]
    assert wp["ata"] == "10:15" and wp["actual_fob"] == "500" and wp["passed"] is True
    # unknown ident
    r = other_user.patch(f"{base_url}/api/flights/{fid}/waypoint-log", json={"ident": "ZZZZZ", "ata": "10:00"}, timeout=15)
    assert r.status_code == 404


# Times
def test_times(other_user, base_url, kg_flight):
    fid = kg_flight["id"]
    r = other_user.patch(f"{base_url}/api/flights/{fid}/times", json={"off": "10:00", "takeoff": "10:12", "tsat": "09:55", "ctot": "10:10"}, timeout=15)
    assert r.status_code == 200
    t = other_user.get(f"{base_url}/api/flights/{fid}", timeout=15).json()["times"]
    assert t["off"] == "10:00" and t["takeoff"] == "10:12" and t["tsat"] == "09:55" and t["ctot"] == "10:10"
    assert t["sched_off"]  # scheduled preserved


def test_times_invalid_format_accepted(other_user, base_url, kg_flight):
    """No validation of HH:MM format (reported as minor)."""
    fid = kg_flight["id"]
    r = other_user.patch(f"{base_url}/api/flights/{fid}/times", json={"landing": "garbage"}, timeout=15)
    print("invalid time status", r.status_code)
    other_user.patch(f"{base_url}/api/flights/{fid}/times", json={"landing": ""}, timeout=15)
    assert r.status_code in (200, 422)


# Actuals
def test_actuals(other_user, base_url, kg_flight):
    fid = kg_flight["id"]
    r = other_user.patch(f"{base_url}/api/flights/{fid}/actuals", json={"pax_count": "150", "cargo": "2000", "units": "LB"}, timeout=15)
    assert r.status_code == 200
    w = other_user.get(f"{base_url}/api/flights/{fid}", timeout=15).json()["weights"]
    assert w["pax_count"] == "150" and w["cargo"] == "2000"
    assert w["units"] == "LB" and w["ofp_units"] == "KG"
    assert w["planned_pax"] == kg_flight["weights"]["planned_pax"]
    other_user.patch(f"{base_url}/api/flights/{fid}/actuals", json={"units": "KG"}, timeout=15)


# Signoff + reset
def test_signoff_and_reset(other_user, base_url, kg_flight):
    fid = kg_flight["id"]
    r = other_user.post(f"{base_url}/api/flights/{fid}/signoff", json={"signed_by": "TEST Capt", "remarks": "ok"}, timeout=15)
    assert r.status_code == 200 and r.json()["signoff"]["signed"] is True
    g = other_user.get(f"{base_url}/api/flights/{fid}", timeout=15).json()
    assert g["signoff"]["signed_by"] == "TEST Capt" and g["signoff"]["signed_at"]
    r = other_user.post(f"{base_url}/api/flights/{fid}/reset", json={}, timeout=15)
    assert r.status_code == 200
    g = other_user.get(f"{base_url}/api/flights/{fid}", timeout=15).json()
    assert all(not w["passed"] and not w.get("ata") and not w.get("actual_fob") for w in g["waypoints"])
    assert g["signoff"]["signed"] is False
    for k in ("off", "takeoff", "landing", "on", "tsat", "ctot"):
        assert g["times"].get(k) is None
    for k in ("sched_off", "sched_takeoff", "sched_landing", "sched_on"):
        assert g["times"].get(k) == kg_flight["times"][k]


def test_signoff_empty_name(other_user, base_url, kg_flight):
    r = other_user.post(f"{base_url}/api/flights/{kg_flight['id']}/signoff", json={"signed_by": ""}, timeout=15)
    print("empty signed_by status", r.status_code)
    other_user.post(f"{base_url}/api/flights/{kg_flight['id']}/reset", json={}, timeout=15)


# Isolation
def test_isolation(pilot_client, base_url, kg_flight):
    fid = kg_flight["id"]
    assert pilot_client.get(f"{base_url}/api/flights/{fid}", timeout=15).status_code == 404
    ident = kg_flight["waypoints"][0]["ident"]
    assert pilot_client.patch(f"{base_url}/api/flights/{fid}/waypoint-log", json={"ident": ident, "ata": "11:00"}, timeout=15).status_code == 404
    assert pilot_client.patch(f"{base_url}/api/flights/{fid}/times", json={"off": "11:00"}, timeout=15).status_code == 404
    assert pilot_client.patch(f"{base_url}/api/flights/{fid}/actuals", json={"pax_count": "1"}, timeout=15).status_code == 404
    assert pilot_client.post(f"{base_url}/api/flights/{fid}/signoff", json={"signed_by": "x"}, timeout=15).status_code == 404
    assert pilot_client.post(f"{base_url}/api/flights/{fid}/reset", json={}, timeout=15).status_code == 404
    assert pilot_client.delete(f"{base_url}/api/flights/{fid}", timeout=15).status_code == 404
    ids = [f["id"] for f in pilot_client.get(f"{base_url}/api/flights", timeout=15).json()]
    assert fid not in ids


def test_duplicate_idents(kg_flight, pilot_client, base_url):
    """Report: backend matches waypoints by ident; duplicates in an OFP get logged together."""
    for f in [kg_flight] + pilot_client.get(f"{base_url}/api/flights", timeout=15).json():
        idents = [w["ident"] for w in f["waypoints"]]
        dups = {i for i in idents if idents.count(i) > 1}
        print(f["origin"], f["destination"], "duplicate idents:", dups)
