# Iteration 9: client_errors TTL index + created datetime; regression of iter8 suite (gzip, client-errors, SSE)
import uuid
import datetime
import requests
import pytest
from pymongo import MongoClient
from dotenv import dotenv_values
from conftest import BASE_URL

_env = dotenv_values("/app/backend/.env")
_db = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
MARK = f"TEST_iter9_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    _db.client_errors.delete_many({"message": {"$regex": f"^{MARK}"}})


# TTL index on client_errors.created (7 days)
def test_client_errors_ttl_index():
    idx = _db.client_errors.index_information()
    ttl = [v for v in idx.values() if v.get("key") == [("created", 1)]]
    assert ttl, idx
    assert ttl[0].get("expireAfterSeconds") == 7 * 86400


# Posted errors store a real datetime in 'created' so TTL can expire them
def test_client_error_created_is_datetime():
    msg = f"{MARK} ttl"
    r = requests.post(f"{BASE_URL}/api/client-errors", json={"message": msg}, timeout=15)
    assert r.status_code == 200 and r.json() == {"ok": True}
    doc = _db.client_errors.find_one({"message": msg})
    assert doc and isinstance(doc["created"], datetime.datetime)
