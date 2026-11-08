"""Iter11 helper: list or delete boot-watchdog client_errors rows. Usage: python iter11_client_errors.py list|delete <since_iso>"""
import sys
from datetime import datetime
from pymongo import MongoClient
from dotenv import dotenv_values

env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
since = datetime.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else datetime(2000, 1, 1)
q = {"message": "App bundle did not boot within 10s", "created": {"$gte": since}}
if sys.argv[1] == "list":
    for d in db.client_errors.find(q):
        print(d["_id"], d["created"], d.get("url"), (d.get("ua") or "")[:60], (d.get("stack") or "")[:200])
elif sys.argv[1] == "delete":
    ids = [d["_id"] for d in db.client_errors.find(q, {"_id": 1})]
    print("deleting", len(ids), db.client_errors.delete_many({"_id": {"$in": ids}}).deleted_count)
