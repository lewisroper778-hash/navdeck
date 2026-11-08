"""NAVDECK iteration 5 backend tests: presence, stats, logbook, documents/PDF, VATSIM, METAR, notes, AI SSE, min_takeoff, lat/lon."""
import json
import pytest
import requests

PILOT_FID = "f6604740-8ebf-4ff3-b510-037a845b9776"


@pytest.fixture(scope="module")
def flight(other_user, base_url):
    r = other_user.post(f"{base_url}/api/flights/import", json={"pilot_id": "1"}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def _u(base_url, fid, p=""):
    return f"{base_url}/api/flights/{fid}{p}"


# Auth: protected endpoints 401 without token
@pytest.mark.parametrize("path", ["/api/stats", "/api/logbook", "/api/documents", "/api/me", "/api/metar/EDDB", "/api/vatsim/member/1000000"])
def test_requires_auth(base_url, path):
    assert requests.get(f"{base_url}{path}", timeout=15).status_code == 401


def test_presence(base_url, pilot_client):
    pub = requests.get(f"{base_url}/api/presence", timeout=15)
    assert pub.status_code == 200 and isinstance(pub.json()["online"], int)
    assert requests.post(f"{base_url}/api/presence", timeout=15).status_code == 401
    r = pilot_client.post(f"{base_url}/api/presence", timeout=15)
    assert r.status_code == 200 and r.json()["online"] >= 1


# OFP parse: min_takeoff and coordinates
def test_import_min_takeoff_coords(flight):
    assert flight["fuel"].get("min_takeoff"), flight["fuel"]
    pts = [w for w in flight["waypoints"] if w.get("lat") is not None and w.get("lon") is not None]
    assert len(pts) >= 2
    assert all(-90 <= w["lat"] <= 90 and -180 <= w["lon"] <= 180 for w in pts)


def test_pilot_ua124_has_coords(base_url, pilot_client):
    r = pilot_client.get(_u(base_url, PILOT_FID), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["fuel"].get("min_takeoff")
    assert sum(1 for w in d["waypoints"] if w.get("lat") is not None) >= 2


def test_stats_shape_pilot(base_url, pilot_client):
    r = pilot_client.get(f"{base_url}/api/stats", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("flights_total", "flights_closed", "block_minutes", "air_minutes", "landings", "avg_landing_rate", "best_landing_rate", "distance_nm"):
        assert k in d
    assert d["flights_total"] >= d["flights_closed"]


def test_notes_and_metar(base_url, other_user, flight):
    fid = flight["id"]
    r = other_user.patch(_u(base_url, fid, "/notes"), json={"metar": "TEST_METAR EDDB 1200Z", "runway": "25R"}, timeout=15)
    assert r.status_code == 200 and r.json()["arrival_notes"]["runway"] == "25R"
    r = other_user.patch(_u(base_url, fid, "/notes"), json={"notes": "TEST_gate B5"}, timeout=15)
    g = other_user.get(_u(base_url, fid), timeout=15).json()["arrival_notes"]
    assert g == {"metar": "TEST_METAR EDDB 1200Z", "runway": "25R", "notes": "TEST_gate B5"}
    m = other_user.get(f"{base_url}/api/metar/{flight['destination']}", timeout=20)
    assert m.status_code == 200 and m.json()["icao"] == flight["destination"]
    assert m.json()["metar"] is None or flight["destination"] in m.json()["metar"]
    assert other_user.get(f"{base_url}/api/metar/EDD", timeout=15).status_code == 400
    assert other_user.get(f"{base_url}/api/metar/ZZZZ", timeout=20).status_code == 200


def test_notes_isolation(base_url, other_user):
    # other user can't touch pilot's flight
    assert other_user.patch(_u(base_url, PILOT_FID, "/notes"), json={"runway": "X"}, timeout=15).status_code == 404
    assert other_user.get(f"{base_url}/api/ai/{PILOT_FID}/chat", timeout=15).status_code == 404


def test_ai_validation(base_url, other_user, flight):
    fid = flight["id"]
    assert other_user.post(f"{base_url}/api/ai/{fid}/bogus", json={}, timeout=15).status_code == 404
    assert other_user.post(f"{base_url}/api/ai/{fid}/chat", json={"message": "  "}, timeout=15).status_code == 400
    assert requests.post(f"{base_url}/api/ai/{fid}/briefing", json={}, timeout=15).status_code == 401


# AI chat SSE (one LLM call), history persists
def test_ai_chat_stream(base_url, other_user, flight):
    fid = flight["id"]
    r = other_user.post(f"{base_url}/api/ai/{fid}/chat", json={"message": "TEST_ What is my block fuel? one sentence"}, stream=True, timeout=120)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    text, done = "", False
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        data = line[6:]
        if data == "[DONE]":
            done = True
            break
        j = json.loads(data)
        assert "error" not in j, j
        text += j.get("delta", "")
    assert done and len(text) > 5
    h = other_user.get(f"{base_url}/api/ai/{fid}/chat", timeout=15).json()
    assert [m["role"] for m in h[-2:]] == ["pilot", "copilot"] and h[-1]["text"] == text


def test_vatsim(base_url, pilot_client):
    r = requests.get(f"{base_url}/api/vatsim/pilots", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["pilots"], list) and isinstance(d["controllers"], int)
    if d["pilots"]:
        assert {"cid", "callsign", "lat", "lon"} <= set(d["pilots"][0])
    m = pilot_client.get(f"{base_url}/api/vatsim/member/1000000", timeout=30)
    assert m.status_code == 200 and m.json()["cid"] == "1000000"
    assert pilot_client.get(f"{base_url}/api/vatsim/member/abc", timeout=15).status_code == 400
    assert pilot_client.get(f"{base_url}/api/vatsim/member/999999999", timeout=30).status_code in (404,)


def test_vatsim_cid_profile(base_url, other_user):
    r = other_user.put(f"{base_url}/api/me", json={"vatsim_cid": "1000000"}, timeout=15)
    assert r.status_code == 200 and r.json()["vatsim_cid"] == "1000000"
    assert other_user.get(f"{base_url}/api/me", timeout=15).json()["vatsim_cid"] == "1000000"


# Close -> PDF stored -> logbook + documents; re-close soft-deletes old doc
def test_close_pdf_logbook(base_url, other_user, flight):
    fid = flight["id"]
    other_user.patch(_u(base_url, fid, "/times"), json={"off": "10:00", "takeoff": "10:10", "landing": "11:40", "on": "11:50"}, timeout=15)
    other_user.patch(_u(base_url, fid, "/arrival"), json={"landing_rate": "-140", "arrival_fob": "3000"}, timeout=15)
    sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    r = other_user.post(_u(base_url, fid, "/signoff"), json={"signed_by": "TEST_Capt", "signature": sig}, timeout=15)
    assert r.status_code == 200 and r.json()["signoff"]["signature"] == sig
    r = other_user.post(_u(base_url, fid, "/close"), timeout=120)
    assert r.status_code == 200 and r.json()["status"] == "closed"
    # locked
    assert other_user.patch(_u(base_url, fid, "/notes"), json={"runway": "09"}, timeout=15).status_code == 409
    lb = other_user.get(f"{base_url}/api/logbook", timeout=15).json()
    row = next(x for x in lb if x["id"] == fid)
    assert row["block_minutes"] == 110 and row["air_minutes"] == 90 and row["document_id"]
    docs = other_user.get(f"{base_url}/api/documents", timeout=15).json()
    assert any(d["id"] == row["document_id"] for d in docs) and all("storage_path" not in d for d in docs)
    f = other_user.get(f"{base_url}/api/documents/{row['document_id']}/file", timeout=60)
    assert f.status_code == 200 and f.headers["content-type"] == "application/pdf" and f.content[:4] == b"%PDF"
    st = other_user.get(f"{base_url}/api/stats", timeout=15).json()
    assert st["flights_closed"] == 1 and st["avg_landing_rate"] == 140 and st["best_landing_rate"] == 140 and st["block_minutes"] == 110
    # close again -> new doc, old one soft-deleted
    other_user.post(_u(base_url, fid, "/close"), timeout=120)
    new = next(x for x in other_user.get(f"{base_url}/api/logbook", timeout=15).json() if x["id"] == fid)["document_id"]
    assert new != row["document_id"]
    assert other_user.get(f"{base_url}/api/documents/{row['document_id']}/file", timeout=30).status_code == 404
    assert len(other_user.get(f"{base_url}/api/documents", timeout=15).json()) == 1


def test_document_isolation(base_url, other_user, pilot_client):
    lb = pilot_client.get(f"{base_url}/api/logbook", timeout=15).json()
    ids = [x["document_id"] for x in lb if x.get("document_id")]
    if not ids:
        pytest.skip("pilot has no documents")
    assert other_user.get(f"{base_url}/api/documents/{ids[0]}/file", timeout=15).status_code == 404
    r = pilot_client.get(f"{base_url}/api/documents/{ids[0]}/file", timeout=60)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
