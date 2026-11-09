# Iteration 11: static assets (icons, manifest, boot watchdog html, exe download) + bridge regression with saved token
import subprocess
import requests
import pytest

from conftest import BASE_URL

FID = "bridge-test-flight"
API = f"{BASE_URL}/api/bridge"
TOKEN = open("/app/backend/tests/.bridge_token").read().strip()


# --- Icons ---
@pytest.mark.parametrize("path", ["/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/favicon.png"])
def test_icons_png(path):
    r = requests.get(BASE_URL + path, timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_icon_sizes():
    import struct
    for path, size in (("/apple-touch-icon.png", 180), ("/icon-192.png", 192), ("/icon-512.png", 512)):
        b = requests.get(BASE_URL + path, timeout=30).content
        w, h = struct.unpack(">II", b[16:24])
        assert (w, h) == (size, size), path


# --- index.html & manifest ---
def test_index_html_watchdog_and_icons():
    html = requests.get(BASE_URL + "/", timeout=30).text
    assert 'rel="apple-touch-icon" sizes="180x180"' in html
    assert 'rel="icon" type="image/png"' in html
    assert 'data-testid="boot-fallback"' in html and 'data-testid="boot-reload"' in html and 'data-testid="boot-reset"' in html
    assert "App bundle did not boot within 10s" in html
    assert '<script defer src="https://assets.emergent.sh/scripts/emergent-main.js"' in html
    assert "background:#020617" in html


def test_manifest_icons():
    m = requests.get(BASE_URL + "/manifest.json", timeout=30).json()
    srcs = {i["src"]: i for i in m["icons"]}
    assert {"/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"} <= set(srcs)
    assert srcs["/icon-512.png"]["sizes"] == "512x512"


def test_sw_v3():
    js = requests.get(BASE_URL + "/sw.js", timeout=30).text
    assert 'const CACHE = "navdeck-v3"' in js and "/downloads/" in js


# --- Download ---
def test_exe_download():
    r = requests.get(BASE_URL + "/downloads/NavdeckLink.exe", stream=True, timeout=60)
    assert r.status_code == 200
    print("headers:", dict(r.headers))
    assert "application/octet-stream" in r.headers.get("content-type", "") or "x-msdownload" in r.headers.get("content-type", "")
    it = r.iter_content(1 << 20)
    head = next(it)
    assert head[:2] == b"MZ"
    total = len(head) + sum(len(c) for c in it)
    assert 70_000_000 < total < 75_000_000, total


def test_python_helper_removed():
    r = requests.get(BASE_URL + "/navdeck-bridge.py", timeout=30)
    assert r.status_code in (200, 404)
    assert "import" not in r.text[:2000] or "<html" in r.text.lower()
    assert r.headers.get("content-type", "").startswith("text/html") or r.status_code == 404


# --- Bridge regression with saved token ---
@pytest.fixture(scope="module")
def reset():
    subprocess.run(["python", "/app/backend/tests/bridge_flight_tool.py", "reset"], check=True, capture_output=True)
    yield
    subprocess.run(["python", "/app/backend/tests/bridge_flight_tool.py", "reset"], check=True, capture_output=True)


def test_bridge_flight_saved_token(reset):
    r = requests.get(f"{API}/flight", headers={"X-Bridge-Token": TOKEN}, timeout=30)
    assert r.status_code == 200, r.text
    f = r.json()["flight"]
    assert f["id"] == FID and f["callsign"] == "TST001"


def test_bridge_events_fill(reset, pilot_client):
    h = {"X-Bridge-Token": TOKEN}
    assert requests.post(f"{API}/event", headers=h, json={"type": "off", "time": "12:30"}).json()["applied"] == ["off"]
    assert requests.post(f"{API}/event", headers=h, json={"type": "takeoff", "time": "12:48"}).json()["applied"] == ["takeoff"]
    assert requests.post(f"{API}/event", headers=h, json={"type": "landing", "time": "15:05", "landing_rate": 142}).json()["applied"] == ["landing", "landing_rate"]
    assert requests.post(f"{API}/event", headers=h, json={"type": "on", "time": "15:14", "fuel_lb": 9600}).json()["applied"] == ["on", "arrival_fob"]
    f = pilot_client.get(f"{BASE_URL}/api/flights/{FID}").json()
    assert f["times"]["off"] == "12:30" and f["times"]["takeoff"] == "12:48"
    assert f["times"]["landing"] == "15:05" and f["times"]["on"] == "15:14"
    assert str(f["landing_rate"]) == "142"
    assert str(f["arrival_fob"]) == str(round(9600 / 2.20462))
