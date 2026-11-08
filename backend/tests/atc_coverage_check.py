"""Helper: report which live VATSIM CTR/APP/TWR controllers are not mapped by /api/vatsim/atc."""
import requests
from dotenv import dotenv_values

base = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
feed = requests.get("https://data.vatsim.net/v3/vatsim-data.json", timeout=20).json()
atc = requests.get(f"{base}/api/vatsim/atc", timeout=60).json()
mapped = {s["callsign"] for s in atc["sectors"]} | {p["callsign"] for a in atc["airports"] for p in a["positions"]}
ctr = [c["callsign"] for c in feed["controllers"] if c["callsign"].split("_")[-1] in ("CTR", "FSS")]
apt = [c["callsign"] for c in feed["controllers"] if c["callsign"].split("_")[-1] in ("DEL", "GND", "TWR", "APP", "DEP")]
print("CTR total", len(ctr), "unmapped", [c for c in ctr if c not in mapped])
print("APT total", len(apt), "unmapped", [c for c in apt if c not in mapped])
print("other types", sorted({c["callsign"].split("_")[-1] for c in feed["controllers"]}))
print("sample sector", [(s["callsign"], s["name"], len(s["geometries"])) for s in atc["sectors"][:8]])
print("sample pilots", [p["callsign"] for p in feed["pilots"][:15]])
