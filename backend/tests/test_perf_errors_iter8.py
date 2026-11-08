# Iteration 8: health, gzip on VATSIM endpoints, client error reporting, AI SSE not gzipped/buffered
import time
import uuid
import requests
import pytest
from pymongo import MongoClient
from dotenv import dotenv_values
from conftest import BASE_URL, session_token, PILOT_USER_ID

FLIGHT_ID = "ee9720b3-9736-487a-a34f-df926f0bffbd"
_env = dotenv_values("/app/backend/.env")
_db = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
MARK = f"TEST_iter8_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module", autouse=True)
def cleanup_client_errors():
    yield
    _db.client_errors.delete_many({"message": {"$regex": f"^{MARK}"}})


# Health
def test_health():
    # Public /health is routed to the frontend by ingress; the platform probe hits the backend port directly
    r = requests.get("http://127.0.0.1:8001/health", timeout=15)
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# GZip + speed on VATSIM data
@pytest.mark.parametrize("path", ["/api/vatsim/pilots", "/api/vatsim/atc"])
def test_vatsim_gzip_and_fast(path):
    requests.get(f"{BASE_URL}{path}", timeout=30)  # warm cache
    t = time.time()
    r = requests.get(f"{BASE_URL}{path}", headers={"Accept-Encoding": "gzip"}, timeout=30)
    dt = time.time() - t
    assert r.status_code == 200
    assert r.headers.get("Content-Encoding") == "gzip"
    assert isinstance(r.json(), dict)
    print(path, f"{dt:.2f}s")
    assert dt < 3


def test_vatsim_no_gzip_when_not_accepted():
    r = requests.get(f"{BASE_URL}/api/vatsim/pilots", headers={"Accept-Encoding": "identity"}, timeout=30)
    assert r.status_code == 200
    assert "gzip" not in (r.headers.get("Content-Encoding") or "")


# Client error reporting
def test_client_error_ok_and_persisted():
    msg = f"{MARK} boom"
    r = requests.post(f"{BASE_URL}/api/client-errors", json={"message": msg, "url": "https://x/test"}, timeout=15)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    doc = _db.client_errors.find_one({"message": msg})
    assert doc and doc["url"] == "https://x/test" and "at" in doc


def test_client_error_oversize_422():
    r = requests.post(f"{BASE_URL}/api/client-errors", json={"message": MARK + "x" * 2100}, timeout=15)
    assert r.status_code == 422
    r2 = requests.post(f"{BASE_URL}/api/client-errors", json={"message": MARK, "stack": "s" * 6001}, timeout=15)
    assert r2.status_code == 422


def test_client_error_missing_message_422():
    r = requests.post(f"{BASE_URL}/api/client-errors", json={"url": "u"}, timeout=15)
    assert r.status_code == 422


# AI SSE must stream incrementally and not be gzipped
def test_ai_briefing_streams():
    tok = session_token(PILOT_USER_ID)
    r = requests.post(f"{BASE_URL}/api/ai/{FLIGHT_ID}/briefing", json={},
                      headers={"Authorization": f"Bearer {tok}", "Accept-Encoding": "gzip"}, stream=True, timeout=120)
    assert r.status_code == 200, r.text[:300]
    assert r.headers.get("Content-Type", "").startswith("text/event-stream")
    assert "gzip" not in (r.headers.get("Content-Encoding") or "")
    arrivals, chunks = [], 0
    t0 = time.time()
    for line in r.iter_lines():
        if line and line.startswith(b"data:"):
            chunks += 1
            arrivals.append(time.time() - t0)
        if time.time() - t0 > 90:
            break
    print("chunks", chunks, "first", arrivals[:1], "last", arrivals[-1:])
    assert chunks > 3
    assert arrivals[-1] - arrivals[0] > 0.3  # spread over time, i.e. not buffered
