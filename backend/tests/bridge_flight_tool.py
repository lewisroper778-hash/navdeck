"""Helper for bridge tests: show or reset bridge-test-flight (times except sched_*, landing_rate, arrival_fob)."""
import sys
import json
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
FID = "bridge-test-flight"


def show():
    f = db.flights.find_one({"id": FID}, {"_id": 0, "id": 1, "status": 1, "times": 1, "landing_rate": 1, "arrival_fob": 1,
                                          "imported_at": 1, "user_id": 1, "weights.ofp_units": 1, "callsign": 1})
    print(json.dumps(f, default=str, indent=1))
    opens = list(db.flights.find({"user_id": f["user_id"], "status": {"$ne": "closed"}}, {"_id": 0, "id": 1, "callsign": 1, "imported_at": 1, "status": 1}))
    print("open flights:", json.dumps(opens, default=str))


def reset():
    f = db.flights.find_one({"id": FID}, {"_id": 0, "times": 1})
    times = {k: v for k, v in (f.get("times") or {}).items() if k.startswith("sched_")}
    db.flights.update_one({"id": FID}, {"$set": {"times": times, "landing_rate": None, "arrival_fob": None}})
    print("reset ok", times)


if __name__ == "__main__":
    reset() if "reset" in sys.argv else show()
