# Iteration 7: NAVDECK Sim Link bridge API (/api/bridge/*) tests
import subprocess
import requests
import pytest

from conftest import BASE_URL

API = f"{BASE_URL}/api/bridge"
FID = "bridge-test-flight"
OTHER_OPEN = "ee9720b3-9736-487a-a34f-df926f0bffbd"


def reset_flight():
    subprocess.run(["python", "/app/backend/tests/bridge_flight_tool.py", "reset"], check=True, capture_output=True)


def bh(token):
    return {"X-Bridge-Token": token}


@pytest.fixture(scope="module")
def token(pilot_client):
    reset_flight()
    r = pilot_client.post(f"{API}/link")
    assert r.status_code == 200
    t = r.json()["token"]
    assert isinstance(t, str) and len(t) >= 30
    pilot_client.put(f"{API}/target", json={"flight_id": FID})
    yield t
    # leave a fresh valid token for later runs, flight reset
    r = pilot_client.post(f"{API}/link")
    open("/app/backend/tests/.bridge_token", "w").write(r.json()["token"])
    reset_flight()


# --- Auth ---
class TestBridgeAuth:
    def test_link_requires_clerk(self):
        assert requests.post(f"{API}/link").status_code == 401
        assert requests.get(f"{API}/status").status_code == 401

    def test_missing_and_invalid_token(self, token):
        assert requests.get(f"{API}/flight").status_code == 401
        assert requests.get(f"{API}/flight", headers=bh("x" * 40)).status_code == 401
        assert requests.post(f"{API}/event", headers=bh("bad"), json={"type": "off", "time": "10:00"}).status_code == 401

    def test_relink_invalidates_old(self, pilot_client):
        old = pilot_client.post(f"{API}/link").json()["token"]
        new = pilot_client.post(f"{API}/link").json()["token"]
        assert requests.get(f"{API}/flight", headers=bh(old)).status_code == 401
        assert requests.get(f"{API}/flight", headers=bh(new)).status_code == 200
        pilot_client.delete(f"{API}/link")
        assert requests.get(f"{API}/flight", headers=bh(new)).status_code == 401
        assert pilot_client.get(f"{API}/status").json() == {"paired": False}


# --- Flight, heartbeat, status ---
class TestBridgeFlow:
    @pytest.fixture(autouse=True)
    def _relink(self, pilot_client, request):
        # TestBridgeAuth deletes link; recreate once and store on class
        if not getattr(TestBridgeFlow, "tok", None):
            reset_flight()
            TestBridgeFlow.tok = pilot_client.post(f"{API}/link").json()["token"]
        self.t = TestBridgeFlow.tok

    def test_flight_default_target(self):
        r = requests.get(f"{API}/flight", headers=bh(self.t))
        assert r.status_code == 200
        f = r.json()["flight"]
        assert f["id"] == FID and f["callsign"] == "TST001" and f["origin"] == "LEIB" and f["destination"] == "EGCC"

    def test_validation_422(self):
        for body in ({"type": "off", "time": "25:00"}, {"type": "off", "time": "9:5"}, {"type": "boom", "time": "10:00"},
                     {"type": "landing", "time": "10:00", "landing_rate": -5}):
            assert requests.post(f"{API}/event", headers=bh(self.t), json=body).status_code == 422, body

    def test_heartbeat_and_status_online(self, pilot_client):
        r = requests.post(f"{API}/heartbeat", headers=bh(self.t), json={"sim": "MSFS", "aircraft": "TEST_A320", "connected": True})
        assert r.status_code == 200
        s = pilot_client.get(f"{API}/status").json()
        assert s["paired"] is True and s["online"] is True
        assert s["sim"] == "MSFS" and s["aircraft"] == "TEST_A320"
        assert s["flight_id"] == FID and s["flight"] == "TST001 LEIB→EGCC"
        assert "token_hash" not in s and "_id" not in s

    def test_heartbeat_disconnected_offline(self, pilot_client):
        requests.post(f"{API}/heartbeat", headers=bh(self.t), json={"sim": "MSFS", "aircraft": "TEST_A320", "connected": False})
        assert pilot_client.get(f"{API}/status").json()["online"] is False

    def test_events_fill_and_no_overwrite(self, pilot_client):
        v0 = pilot_client.get(f"{API}/status").json()["version"]
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "off", "time": "12:30"})
        assert r.status_code == 200 and r.json() == {"flight_id": FID, "applied": ["off"]}
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "takeoff", "time": "12:48"})
        assert r.json()["applied"] == ["takeoff"]
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "landing", "time": "15:05", "landing_rate": 141.6})
        assert r.json()["applied"] == ["landing", "landing_rate"]
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "on", "time": "15:14", "fuel_lb": 9800})
        assert r.json()["applied"] == ["on", "arrival_fob"]
        # repeat - no overwrite
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "landing", "time": "16:00", "landing_rate": 500})
        assert r.json()["applied"] == []
        r = requests.post(f"{API}/event", headers=bh(self.t), json={"type": "on", "time": "16:10", "fuel_lb": 1})
        assert r.json()["applied"] == []
        f = pilot_client.get(f"{BASE_URL}/api/flights/{FID}").json()
        assert f["times"]["off"] == "12:30" and f["times"]["takeoff"] == "12:48"
        assert f["times"]["landing"] == "15:05" and f["times"]["on"] == "15:14"
        assert f["times"]["sched_off"] == "12:25"
        assert str(f["landing_rate"]) == "142"
        assert str(f["arrival_fob"]) == str(round(9800 / 2.20462))  # 4445 kg
        s = pilot_client.get(f"{API}/status").json()
        assert s["version"] == v0 + 6
        assert s["last_event"]["type"] == "on" and s["last_event"]["applied"] == []
        reset_flight()

    def test_target_switch(self, pilot_client):
        assert pilot_client.put(f"{API}/target", json={"flight_id": OTHER_OPEN}).status_code == 200
        assert requests.get(f"{API}/flight", headers=bh(self.t)).json()["flight"]["id"] == OTHER_OPEN
        assert pilot_client.get(f"{API}/status").json()["flight_id"] == OTHER_OPEN
        assert pilot_client.put(f"{API}/target", json={"flight_id": "does-not-exist"}).status_code == 404
        assert pilot_client.put(f"{API}/target", json={"flight_id": FID}).status_code == 200
        assert requests.get(f"{API}/flight", headers=bh(self.t)).json()["flight"]["id"] == FID

    def test_closed_flight_not_targetable(self, pilot_client):
        # UA124 f6604740... is closed for the pilot (see iteration_6)
        closed = [f for f in pilot_client.get(f"{BASE_URL}/api/flights").json() if f.get("status") == "closed"]
        if not closed:
            pytest.skip("no closed flight")
        assert pilot_client.put(f"{API}/target", json={"flight_id": closed[0]["id"]}).status_code == 404


# --- User with no open flights -> 409 ---
def test_no_open_flight_409(other_user):
    t = other_user.post(f"{API}/link").json()["token"]
    assert requests.get(f"{API}/flight", headers=bh(t)).json() == {"flight": None}
    r = requests.post(f"{API}/event", headers=bh(t), json={"type": "off", "time": "10:00"})
    assert r.status_code == 409
    assert other_user.put(f"{API}/target", json={"flight_id": FID}).status_code == 404  # can't target another user's flight
    other_user.delete(f"{API}/link")
