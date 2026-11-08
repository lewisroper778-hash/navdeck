"""Helper: print pilot profile + compact state of pilot's flights (for UI test setup/restore)."""
import json, sys
sys.path.insert(0, "/app/backend/tests")
import requests
from conftest import session_token, PILOT_USER_ID, BASE_URL

s = requests.Session()
s.headers.update({"Authorization": f"Bearer {session_token(PILOT_USER_ID)}"})
me = s.get(f"{BASE_URL}/api/me", timeout=15).json()
print("ME", json.dumps(me))
for f in s.get(f"{BASE_URL}/api/flights", timeout=15).json():
    print(f["id"], f["callsign"], f["status"], json.dumps(f["times"]), f["landing_rate"], f["arrival_fob"], f["signoff"],
          f["weights"]["units"], [(i, w["ident"], w["ata"], w["actual_fob"], w["passed"]) for i, w in enumerate(f["waypoints"]) if w["ata"] or w["actual_fob"] or w["passed"]],
          "last_fob", f["waypoints"][-1]["fob"], "fuel", {k: f["fuel"].get(k) for k in ("min_fuel", "mayday_fuel", "reserve", "alternate")})
