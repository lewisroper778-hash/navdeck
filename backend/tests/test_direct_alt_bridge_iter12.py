"""Iter12: Direct-To group skip/undo, Act ALT waypoint-log, bridge waypoint auto-fill, PDF Act ALT column."""
import subprocess
import sys
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient
from conftest import BASE_URL

API = f"{BASE_URL}/api"
env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
HERE = "/app/backend/tests"
BRIDGE_FID = "bridge-test-flight"


def _copy(closed=False):
    args = [sys.executable, f"{HERE}/iter10_copy_flight.py", "create"] + (["closed"] if closed else [])
    return subprocess.check_output(args, cwd=HERE, text=True).strip()


def _reset_bridge_flight():
    f = db.flights.find_one({"id": BRIDGE_FID}, {"_id": 0, "waypoints": 1})
    for w in f["waypoints"]:
        w.update(passed=False, skipped=False, ata=None, actual_fob=None, actual_alt=None, direct_group=None)
    db.flights.update_one({"id": BRIDGE_FID}, {"$set": {"waypoints": f["waypoints"]}})


@pytest.fixture(scope="module")
def open_copy():
    fid = _copy()
    yield fid
    db.flights.delete_one({"id": fid})


@pytest.fixture(scope="module")
def closed_copy():
    fid = _copy(closed=True)
    yield fid
    db.flights.delete_one({"id": fid})


@pytest.fixture(scope="module")
def bridge():
    tok = open(f"{HERE}/.bridge_token").read().strip()
    s = requests.Session()
    s.headers.update({"X-Bridge-Token": tok})
    _reset_bridge_flight()
    yield s
    _reset_bridge_flight()


# ---------- Direct-To ----------
class TestDirectTo:
    def test_direct_skips_group(self, pilot_client, open_copy):
        f = pilot_client.get(f"{API}/flights/{open_copy}").json()
        wps = f["waypoints"]
        idx = 4
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct", json={"ident": wps[idx]["ident"], "index": idx})
        assert r.status_code == 200, r.text
        w2 = r.json()["waypoints"]
        groups = {w2[i]["direct_group"] for i in range(idx)}
        assert len(groups) == 1 and None not in groups
        assert all(w2[i]["skipped"] for i in range(idx))
        assert not w2[idx]["skipped"] and w2[idx].get("direct_group") is None
        assert not any(w.get("skipped") for w in w2[idx + 1:])
        g = pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"]
        assert [w["skipped"] for w in g[:idx]] == [True] * idx
        TestDirectTo.group = groups.pop()
        TestDirectTo.idx = idx

    def test_direct_to_next_fix_400(self, pilot_client, open_copy):
        wps = pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"]
        i = TestDirectTo.idx
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct", json={"ident": wps[i]["ident"], "index": i})
        assert r.status_code == 400, r.text

    def test_direct_wrong_ident_404(self, pilot_client, open_copy):
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct", json={"ident": "ZZZZZ", "index": 8})
        assert r.status_code == 404

    def test_direct_to_skipped_fix_404(self, pilot_client, open_copy):
        wps = pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"]
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct", json={"ident": wps[1]["ident"], "index": 1})
        assert r.status_code == 404

    def test_undo_restores_then_404(self, pilot_client, open_copy):
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct/undo", json={"group": TestDirectTo.group})
        assert r.status_code == 200
        assert not any(w.get("skipped") or w.get("direct_group") for w in r.json()["waypoints"])
        r2 = pilot_client.post(f"{API}/flights/{open_copy}/direct/undo", json={"group": TestDirectTo.group})
        assert r2.status_code == 404

    def test_direct_respects_passed_and_existing_skips(self, pilot_client, open_copy):
        wps = pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"]
        # pass fix 0, single-skip fix 2, then direct to fix 5 -> group should be 1,3,4
        assert pilot_client.post(f"{API}/flights/{open_copy}/waypoint", json={"ident": wps[0]["ident"], "passed": True, "index": 0}).status_code == 200
        assert pilot_client.post(f"{API}/flights/{open_copy}/waypoint-skip", json={"ident": wps[2]["ident"], "index": 2, "skipped": True}).status_code == 200
        r = pilot_client.post(f"{API}/flights/{open_copy}/direct", json={"ident": wps[5]["ident"], "index": 5})
        assert r.status_code == 200
        w2 = r.json()["waypoints"]
        assert not w2[0]["skipped"] and w2[2]["skipped"] and w2[2].get("direct_group") is None
        grouped = [i for i, w in enumerate(w2) if w.get("direct_group")]
        assert grouped == [1, 3, 4]
        u = pilot_client.post(f"{API}/flights/{open_copy}/direct/undo", json={"group": w2[1]["direct_group"]}).json()["waypoints"]
        assert u[2]["skipped"] and not u[1]["skipped"] and not u[3]["skipped"]

    def test_direct_closed_409(self, pilot_client, closed_copy):
        wps = pilot_client.get(f"{API}/flights/{closed_copy}").json()["waypoints"]
        r = pilot_client.post(f"{API}/flights/{closed_copy}/direct", json={"ident": wps[4]["ident"], "index": 4})
        assert r.status_code == 409
        r = pilot_client.post(f"{API}/flights/{closed_copy}/direct/undo", json={"group": "x"})
        assert r.status_code == 409

    def test_direct_unauth_401(self, open_copy):
        r = requests.post(f"{API}/flights/{open_copy}/direct", json={"ident": "X", "index": 3})
        assert r.status_code in (401, 403)


# ---------- Act ALT ----------
class TestActualAlt:
    def test_alt_save_invalid_clear(self, pilot_client, open_copy):
        wps = pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"]
        i, ident = 8, wps[8]["ident"]
        r = pilot_client.patch(f"{API}/flights/{open_copy}/waypoint-log", json={"ident": ident, "index": i, "actual_alt": "35000"})
        assert r.status_code == 200 and r.json()["waypoints"][i]["actual_alt"] == "35000"
        assert pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"][i]["actual_alt"] == "35000"
        for bad in ("abc", "70000", "-100", "3.5"):
            assert pilot_client.patch(f"{API}/flights/{open_copy}/waypoint-log", json={"ident": ident, "index": i, "actual_alt": bad}).status_code == 422, bad
        assert pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"][i]["actual_alt"] == "35000"
        r = pilot_client.patch(f"{API}/flights/{open_copy}/waypoint-log", json={"ident": ident, "index": i, "actual_alt": ""})
        assert r.status_code == 200 and r.json()["waypoints"][i]["actual_alt"] is None
        assert pilot_client.get(f"{API}/flights/{open_copy}").json()["waypoints"][i]["actual_alt"] is None


# ---------- Bridge waypoint ----------
class TestBridgeWaypoint:
    def test_flight_waypoints(self, bridge):
        r = bridge.get(f"{API}/bridge/flight")
        assert r.status_code == 200
        f = r.json()["flight"]
        assert f["id"] == BRIDGE_FID
        wps = f["waypoints"]
        assert len(wps) == 38
        assert set(wps[0]) == {"index", "ident", "lat", "lon", "done"}
        assert all(w["lat"] is not None and w["lon"] is not None for w in wps)
        assert wps[0]["done"] is False and wps[3]["index"] == 3

    def test_waypoint_fills_and_no_overwrite(self, bridge, pilot_client):
        v0 = pilot_client.get(f"{API}/bridge/status").json()["version"]
        r = bridge.post(f"{API}/bridge/waypoint", json={"index": 0, "ident": "MERIT", "time": "12:34", "fuel_lb": 50123.4, "altitude_ft": 12345.6})
        assert r.status_code == 200, r.text
        assert r.json()["applied"] == ["ata", "actual_fob", "actual_alt"]
        w = pilot_client.get(f"{API}/flights/{BRIDGE_FID}").json()["waypoints"][0]
        assert (w["ata"], w["actual_fob"], w["actual_alt"], w["passed"]) == ("12:34", "50123", "12346", True)
        st = pilot_client.get(f"{API}/bridge/status").json()
        assert st["version"] == v0 + 1 and st["last_event"]["ident"] == "MERIT"
        r = bridge.post(f"{API}/bridge/waypoint", json={"index": 0, "ident": "MERIT", "time": "13:00", "fuel_lb": 1, "altitude_ft": 1})
        assert r.status_code == 200 and r.json()["applied"] == []
        w = pilot_client.get(f"{API}/flights/{BRIDGE_FID}").json()["waypoints"][0]
        assert (w["ata"], w["actual_fob"], w["actual_alt"]) == ("12:34", "50123", "12346")
        assert bridge.get(f"{API}/bridge/flight").json()["flight"]["waypoints"][0]["done"] is True

    def test_waypoint_errors(self, bridge):
        assert bridge.post(f"{API}/bridge/waypoint", json={"index": 999, "ident": "MERIT", "time": "12:34"}).status_code == 404
        assert bridge.post(f"{API}/bridge/waypoint", json={"index": 1, "ident": "MERIT", "time": "12:34"}).status_code == 404
        assert bridge.post(f"{API}/bridge/waypoint", json={"index": 1, "ident": "HFD", "time": "25:00"}).status_code == 422
        assert bridge.post(f"{API}/bridge/waypoint", json={"index": 1, "ident": "HFD", "time": "1234"}).status_code == 422
        assert requests.post(f"{API}/bridge/waypoint", json={"index": 1, "ident": "HFD", "time": "12:34"}).status_code == 401

    def test_waypoint_only_alt_partial(self, bridge, pilot_client):
        # existing manual ATA kept; fuel/alt filled
        pilot_client.patch(f"{API}/flights/{BRIDGE_FID}/waypoint-log", json={"ident": "HFD", "index": 1, "ata": "12:40"})
        r = bridge.post(f"{API}/bridge/waypoint", json={"index": 1, "ident": "HFD", "time": "12:41", "fuel_lb": 49000, "altitude_ft": 20000})
        assert r.json()["applied"] == ["actual_fob", "actual_alt"]
        w = pilot_client.get(f"{API}/flights/{BRIDGE_FID}").json()["waypoints"][1]
        assert w["ata"] == "12:40" and w["actual_alt"] == "20000"


# ---------- PDF ----------
def test_pdf_has_act_alt():
    sys.path.insert(0, "/app/backend")
    from pdf_report import build_report_pdf
    f = db.flights.find_one({"id": BRIDGE_FID}, {"_id": 0})
    f["waypoints"][0]["actual_alt"] = "36000"
    f["airline_icao"] = ""
    from reportlab import rl_config
    rl_config.pageCompression = 0
    pdf = build_report_pdf(f)
    assert pdf[:4] == b"%PDF"
    assert b"Act ALT" in pdf and b"36000" in pdf
