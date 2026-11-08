"""Helper (iter10): create/delete an open TEST_ copy of the closed flight (it has lat/lon) for waypoint-skip recalc tests.
Usage: python iter10_copy_flight.py create  -> prints new id ; python iter10_copy_flight.py delete <id>"""
import sys
import uuid
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
SRC = "f6604740-8ebf-4ff3-b510-037a845b9776"

if sys.argv[1] == "create":
    doc = db.flights.find_one({"id": SRC}, {"_id": 0})
    doc["id"] = f"TEST_iter10_{uuid.uuid4().hex[:8]}"
    doc["status"] = "open"
    doc["raw_simbrief_id"] = doc["id"]
    doc["closed_at"] = None
    doc["signoff"] = {"signed": False}
    for w in doc["waypoints"]:
        w.update(passed=False, skipped=False, ata=None, actual_fob=None)
    if len(sys.argv) > 2 and sys.argv[2] == "closed":
        doc["status"] = "closed"
    db.flights.insert_one(doc)
    print(doc["id"])
elif sys.argv[1] == "delete":
    print(db.flights.delete_one({"id": sys.argv[2]}).deleted_count)
elif sys.argv[1] == "get":
    d = db.flights.find_one({"id": sys.argv[2]}, {"_id": 0, "waypoints.ident": 1, "waypoints.skipped": 1, "status": 1})
    print(d)
