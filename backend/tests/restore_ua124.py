"""Helper: restore UA124 (f6604740) to its pre-iteration-4 state (reset actuals, keep TSAT 10:00)."""
import sys
sys.path.insert(0, "/app/backend/tests")
import requests
from conftest import session_token, PILOT_USER_ID, BASE_URL

FID = "f6604740-8ebf-4ff3-b510-037a845b9776"
s = requests.Session()
s.headers.update({"Authorization": f"Bearer {session_token(PILOT_USER_ID)}"})
print(s.post(f"{BASE_URL}/api/flights/{FID}/reset", timeout=15).status_code)
r = s.patch(f"{BASE_URL}/api/flights/{FID}/times", json={"tsat": "10:00"}, timeout=15)
print(r.status_code, r.json()["status"], r.json()["times"])
