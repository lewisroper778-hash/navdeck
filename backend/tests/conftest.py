import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
_SECRET = dotenv_values("/app/backend/.env").get("CLERK_SECRET_KEY")
CLERK_API = "https://api.clerk.com/v1"
CH = {"Authorization": f"Bearer {_SECRET}", "User-Agent": "enavlog-tester/1.0", "Content-Type": "application/json"}
PILOT_USER_ID = "user_3Lq4UfbibPtTeBffoyK96ASOJdT"


def session_token(user_id):
    r = requests.post(f"{CLERK_API}/sessions", headers=CH, json={"user_id": user_id}, timeout=30)
    r.raise_for_status()
    sid = r.json()["id"]
    r2 = requests.post(f"{CLERK_API}/sessions/{sid}/tokens", headers=CH, json={"expires_in_seconds": 3600}, timeout=30)
    r2.raise_for_status()
    return r2.json()["jwt"]


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def pilot_client():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {session_token(PILOT_USER_ID)}"})
    return s


@pytest.fixture(scope="session")
def other_user():
    email = f"test_iso_{uuid.uuid4().hex[:6]}+clerk_test@example.com"
    r = requests.post(f"{CLERK_API}/users", headers=CH, json={"email_address": [email], "password": "TestPass!xyz12345"}, timeout=30)
    r.raise_for_status()
    uid = r.json()["id"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {session_token(uid)}"})
    yield s
    requests.delete(f"{CLERK_API}/users/{uid}", headers=CH, timeout=15)
