# Iter10: ATC direct / waypoint-skip feature (API + PDF report)
import subprocess
import sys
import io
import pytest

sys.path.insert(0, "/app/backend")
from conftest import BASE_URL  # noqa: E402

OPEN = "ee9720b3-9736-487a-a34f-df926f0bffbd"
CLOSED = "f6604740-8ebf-4ff3-b510-037a845b9776"
HELPER = "/app/backend/tests/iter10_copy_flight.py"


@pytest.fixture(scope="module")
def copy_id():
    fid = subprocess.check_output([sys.executable, HELPER, "create"]).decode().strip()
    yield fid
    subprocess.run([sys.executable, HELPER, "delete", fid])


def skip(c, fid, ident, index, skipped):
    return c.post(f"{BASE_URL}/api/flights/{fid}/waypoint-skip", json={"ident": ident, "index": index, "skipped": skipped})


# Skip + undo on a coordinate-bearing copy, persisted
def test_skip_and_restore_persist(pilot_client, copy_id):
    r = skip(pilot_client, copy_id, "WITCH", 4, True)
    assert r.status_code == 200, r.text
    assert r.json()["waypoints"][4]["skipped"] is True
    g = pilot_client.get(f"{BASE_URL}/api/flights/{copy_id}").json()
    assert g["waypoints"][4]["skipped"] is True
    assert all(not w["skipped"] for i, w in enumerate(g["waypoints"]) if i != 4)
    r = skip(pilot_client, copy_id, "WITCH", 4, False)
    assert r.status_code == 200 and r.json()["waypoints"][4]["skipped"] is False
    assert pilot_client.get(f"{BASE_URL}/api/flights/{copy_id}").json()["waypoints"][4]["skipped"] is False


def test_final_waypoint_400(pilot_client, copy_id):
    r = skip(pilot_client, copy_id, "EDDB", 37, True)
    assert r.status_code == 400 and "final" in r.json()["detail"].lower()


def test_passed_fix_400(pilot_client, copy_id):
    t = pilot_client.post(f"{BASE_URL}/api/flights/{copy_id}/waypoint", json={"ident": "MERIT", "index": 0, "passed": True})
    assert t.status_code == 200
    r = skip(pilot_client, copy_id, "MERIT", 0, True)
    assert r.status_code == 400
    # ATA-only (passed False but ata set) also blocked
    pilot_client.patch(f"{BASE_URL}/api/flights/{copy_id}/waypoint-log", json={"ident": "HFD", "index": 1, "ata": "10:50"})
    pilot_client.post(f"{BASE_URL}/api/flights/{copy_id}/waypoint", json={"ident": "HFD", "index": 1, "passed": False})
    r2 = skip(pilot_client, copy_id, "HFD", 1, True)
    assert r2.status_code == 400, r2.text


def test_not_found_404(pilot_client, copy_id):
    assert skip(pilot_client, copy_id, "XXXXX", 4, True).status_code == 404
    assert skip(pilot_client, copy_id, "WITCH", 99, True).status_code == 404
    assert skip(pilot_client, "nope-id", "WITCH", 4, True).status_code == 404


def test_closed_409(pilot_client):
    r = skip(pilot_client, CLOSED, "WITCH", 4, True)
    assert r.status_code == 409


def test_bad_body_422(pilot_client, copy_id):
    u = f"{BASE_URL}/api/flights/{copy_id}/waypoint-skip"
    assert pilot_client.post(u, json={"ident": "WITCH", "index": 4}).status_code == 422
    assert pilot_client.post(u, json={"ident": "WITCH", "index": -1, "skipped": True}).status_code == 422
    assert pilot_client.post(u, json={"ident": "WITCH", "index": "abc", "skipped": True}).status_code == 422


def test_unauth_401():
    import requests
    r = requests.post(f"{BASE_URL}/api/flights/{OPEN}/waypoint-skip", json={"ident": "TOC", "index": 5, "skipped": True})
    assert r.status_code in (401, 403)


def test_reset_clears_skipped(pilot_client, copy_id):
    assert skip(pilot_client, copy_id, "EBONY", 5, True).status_code == 200
    r = pilot_client.post(f"{BASE_URL}/api/flights/{copy_id}/reset")
    assert r.status_code == 200
    g = pilot_client.get(f"{BASE_URL}/api/flights/{copy_id}").json()
    assert not any(w["skipped"] for w in g["waypoints"])


# Open user flight: toggle then restore (as requested)
def test_open_flight_skip_restore(pilot_client):
    r = skip(pilot_client, OPEN, "EBROX", 6, True)
    assert r.status_code == 200 and r.json()["waypoints"][6]["skipped"] is True
    r = skip(pilot_client, OPEN, "EBROX", 6, False)
    assert r.status_code == 200 and r.json()["waypoints"][6]["skipped"] is False
    # passed fix on the open flight is refused
    assert skip(pilot_client, OPEN, "IB501", 1, True).status_code == 400


# PDF lists skipped fixes as 'DCT (skipped)'
def test_pdf_skipped_rows(pilot_client):
    from reportlab import rl_config
    rl_config.pageCompression = 0
    from pdf_report import build_report_pdf
    f = pilot_client.get(f"{BASE_URL}/api/flights/{CLOSED}").json()
    f["waypoints"][4]["skipped"] = True
    f["waypoints"][5]["skipped"] = True
    pdf = build_report_pdf(f)
    assert pdf[:4] == b"%PDF"
    import re, zlib
    text = b""
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf, re.S):
        try:
            text += zlib.decompress(m.group(1))
        except Exception:
            text += m.group(1)
    assert text.count(b"DCT \\(skipped\\)") == 2, text[:500]
    assert b"(WITCH)" in text and b"(EBONY)" in text
