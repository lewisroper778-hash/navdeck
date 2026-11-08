# Iteration 6: VATSIM friends on /api/me + NOTAMs on flight + AI notams SSE
import sys
import json
import pytest
import requests
from conftest import BASE_URL

FLIGHT = "f6604740-8ebf-4ff3-b510-037a845b9776"


@pytest.fixture(scope="module", autouse=True)
def restore_friends(pilot_client):
    before = pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()
    yield
    r = pilot_client.put(f"{BASE_URL}/api/me", json={"vatsim_friends": []}, timeout=30)
    assert r.status_code == 200 and r.json()["vatsim_friends"] == []
    after = r.json()
    assert after.get("simbrief_pilot_id") == before.get("simbrief_pilot_id")
    assert after.get("vatsim_cid") == before.get("vatsim_cid")


# --- Friends ---
def test_me_has_friends_field(pilot_client):
    r = pilot_client.get(f"{BASE_URL}/api/me", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json()["vatsim_friends"], list)


def test_friends_normalise_dedupe(pilot_client):
    before = pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()
    r = pilot_client.put(f"{BASE_URL}/api/me", json={"vatsim_friends": ["baw123", " BAW123 ", "1234567", "dlh4a", ""]}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["vatsim_friends"] == ["BAW123", "1234567", "DLH4A"]
    g = pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()
    assert g["vatsim_friends"] == ["BAW123", "1234567", "DLH4A"]
    # other fields untouched
    assert g.get("simbrief_pilot_id") == before.get("simbrief_pilot_id")
    assert g.get("vatsim_cid") == before.get("vatsim_cid")


@pytest.mark.parametrize("bad", [["A"], ["BAW 123"], ["TOOLONGCALLSIGN1"], ["BAW!"], [f"X{i:02d}" for i in range(51)]])
def test_friends_invalid_422(pilot_client, bad):
    r = pilot_client.put(f"{BASE_URL}/api/me", json={"vatsim_friends": bad}, timeout=30)
    assert r.status_code == 422, r.text


def test_friends_invalid_did_not_overwrite(pilot_client):
    g = pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()
    assert g["vatsim_friends"] == ["BAW123", "1234567", "DLH4A"]


def test_put_without_friends_keeps_list(pilot_client):
    me = pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()
    r = pilot_client.put(f"{BASE_URL}/api/me", json={"display_name": me.get("display_name")}, timeout=30)
    assert r.status_code == 200
    assert r.json()["vatsim_friends"] == ["BAW123", "1234567", "DLH4A"]


def test_friends_clear(pilot_client):
    r = pilot_client.put(f"{BASE_URL}/api/me", json={"vatsim_friends": []}, timeout=30)
    assert r.status_code == 200 and r.json()["vatsim_friends"] == []
    assert pilot_client.get(f"{BASE_URL}/api/me", timeout=30).json()["vatsim_friends"] == []


def test_me_requires_auth():
    assert requests.put(f"{BASE_URL}/api/me", json={"vatsim_friends": []}, timeout=30).status_code == 401


# --- NOTAMs ---
def test_flight_notams_grouped(pilot_client):
    r = pilot_client.get(f"{BASE_URL}/api/flights/{FLIGHT}", timeout=30)
    assert r.status_code == 200
    n = r.json()["notams"]
    counts = {k: len(n.get(k, [])) for k in ("origin", "destination", "alternate", "enroute")}
    print("counts", counts)
    assert counts == {"origin": 38, "destination": 6, "alternate": 20, "enroute": 19}
    item = n["origin"][0]
    for k in ("id", "location", "text", "raw", "effective", "expires", "category"):
        assert k in item
    assert item["location"] == "KEWR"
    assert all(e["location"] not in ("KEWR", "EDDB") for e in n["enroute"])


def test_ai_notams_requires_auth():
    r = requests.post(f"{BASE_URL}/api/ai/{FLIGHT}/notams", json={}, timeout=30)
    assert r.status_code == 401


def test_ai_notams_stream(pilot_client):
    r = pilot_client.post(f"{BASE_URL}/api/ai/{FLIGHT}/notams", json={}, stream=True, timeout=120)
    assert r.status_code == 200, r.text[:300]
    assert r.headers["content-type"].startswith("text/event-stream")
    text, done, err = "", False, None
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            done = True
            break
        d = json.loads(payload)
        if "error" in d:
            err = d["error"]
            break
        text += d.get("delta", "")
    assert err is None, err
    assert done and len(text) > 50
    print(text[:600])
    f = pilot_client.get(f"{BASE_URL}/api/flights/{FLIGHT}", timeout=30).json()
    assert (f.get("ai") or {}).get("notams") == text


def test_ai_unknown_mode_404(pilot_client):
    r = pilot_client.post(f"{BASE_URL}/api/ai/{FLIGHT}/bogus", json={}, timeout=30)
    assert r.status_code == 404


def test_ai_notams_other_user_404(other_user):
    r = other_user.post(f"{BASE_URL}/api/ai/{FLIGHT}/notams", json={}, timeout=30)
    assert r.status_code == 404


def test_notam_prompt_400_when_empty():
    sys.path.insert(0, "/app/backend")
    from fastapi import HTTPException
    import extras
    for notams in ({}, {"origin": [], "destination": [], "alternate": [], "enroute": []}, None):
        with pytest.raises(HTTPException) as e:
            extras._notam_prompt({"notams": notams})
        assert e.value.status_code == 400


def test_ai_notams_400_real_flight_without_notams(pilot_client):
    # N806SB LEIB-EGCC (open flight, no NOTAMs imported)
    r = pilot_client.post(f"{BASE_URL}/api/ai/ee9720b3-9736-487a-a34f-df926f0bffbd/notams", json={}, timeout=30)
    assert r.status_code == 400
    assert "NOTAM" in r.json()["detail"]
