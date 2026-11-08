"""Helper: create Clerk sign-in ticket URLs for UI tests (prints only the ticket URL)."""
import sys
import requests
from dotenv import dotenv_values

base = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
sk = dotenv_values("/app/backend/.env")["CLERK_SECRET_KEY"]
uid = sys.argv[1] if len(sys.argv) > 1 else "user_3Lq4UfbibPtTeBffoyK96ASOJdT"
r = requests.post("https://api.clerk.com/v1/sign_in_tokens",
                  headers={"Authorization": f"Bearer {sk}", "User-Agent": "enavlog-tester/1.0"},
                  json={"user_id": uid, "expires_in_seconds": 3600}, timeout=30)
r.raise_for_status()
print(f"{base}/sign-in?__clerk_ticket={r.json()['token']}")
