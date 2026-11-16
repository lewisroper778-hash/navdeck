"""Offline smoke tests for desktop Clerk handoff and Mongo outage handling.

Run: MONGO_URL=mongodb://127.0.0.1:27017 DB_NAME=navdeck python backend/check_login_readiness.py
No real MongoDB or Clerk credentials are required.
"""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "navdeck")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import server
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

ORIGINS = [
    "https://test.navdeck.online",
    "https://navdeck.online",
    "https://www.navdeck.online",
    "https://navdeck-frontend.onrender.com",
]
ORIGIN = ORIGINS[0]


class LoginReadinessTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def test_health_is_liveness_not_database_readiness(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})

    def test_ready_when_mongodb_responds(self):
        fake_db = SimpleNamespace(command=AsyncMock(return_value={"ok": 1}))
        with patch.object(server, "db", fake_db):
            response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "connected")

    def test_database_outage_returns_503_quickly(self):
        fake_db = SimpleNamespace(command=AsyncMock(
            side_effect=ServerSelectionTimeoutError("simulated Atlas outage")
        ))
        with patch.object(server, "db", fake_db):
            response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["database"], "unavailable")
        self.assertEqual(response.headers["retry-after"], "5")

    def test_desktop_clerk_preflight_cors(self):
        for origin in ORIGINS:
            with self.subTest(origin=origin):
                response = self.client.options(
                    "/api/bridge/link",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "authorization",
                    },
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    def test_database_error_returns_cors_safe_json(self):
        @server.app.get("/__smoke_test_database_error")
        async def fail():
            raise ServerSelectionTimeoutError("simulated Atlas outage")

        response = self.client.get(
            "/__smoke_test_database_error", headers={"Origin": ORIGIN}
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers.get("access-control-allow-origin"), ORIGIN)
        self.assertNotIn("simulated Atlas outage", response.text)


if __name__ == "__main__":
    unittest.main()
