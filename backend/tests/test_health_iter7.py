# Iteration 7: deploy health probe + core API regression
import requests
from conftest import BASE_URL


# --- Health probe (platform hits 127.0.0.1:8001/health directly) ---
def test_health_local():
    r = requests.get("http://127.0.0.1:8001/health", timeout=10)
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_health_no_auth_required_head_like():
    r = requests.get("http://127.0.0.1:8001/health", headers={"Authorization": "Bearer garbage"}, timeout=10)
    assert r.status_code == 200


# --- Core regression ---
def test_vatsim_pilots():
    r = requests.get(f"{BASE_URL}/api/vatsim/pilots", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), (list, dict))


def test_me_requires_auth():
    assert requests.get(f"{BASE_URL}/api/me", timeout=15).status_code == 401


def test_me_authed(pilot_client):
    r = pilot_client.get(f"{BASE_URL}/api/me", timeout=15)
    assert r.status_code == 200
    assert "_id" not in r.json()
