"""Offline check of the EFB journey-log email endpoint (no database, no real mail server)."""
import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import efb_reports  # noqa: E402

sent = []
app = FastAPI()
app.include_router(efb_reports.build_efb_reports_router(sender=lambda cfg, msg: sent.append((cfg, msg))))
client = TestClient(app)
pdf = b"%PDF-1.7\n" + b"0" * 2048 + b"\n%%EOF"
fields = {"flight": "BAW123", "route": "EGKK-EGLL", "pic": "L ROPER", "closed_at": "2026-11-16T21:00:00Z", "app_version": "1.1.0", "report_id": "abc123"}
failures = []


def check(ok, name):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        failures.append(name)


for key in [k for k in os.environ if k.startswith("EFB_SMTP_") or k == "EFB_REPORTS_TO"]:
    del os.environ[key]
r = client.post("/api/efb/reports", files={"file": ("log.pdf", pdf, "application/pdf")}, data=fields)
check(r.status_code == 503, "refuses politely while email is not configured")

os.environ.update({"EFB_SMTP_HOST": "smtp.example.com", "EFB_SMTP_USER": "inflightreports@navdeck.online", "EFB_SMTP_PASSWORD": "x"})
check(client.get("/api/efb/reports/status").json() == {"configured": True}, "status shows configured")

r = client.post("/api/efb/reports", files={"file": ("log.pdf", b"not a pdf", "application/pdf")}, data=fields)
check(r.status_code == 400 and not sent, "rejects files that are not PDFs")

r = client.post("/api/efb/reports", files={"file": ("log.pdf", pdf, "application/pdf")}, data=fields)
check(r.status_code == 200 and len(sent) == 1, "emails a journey log")
cfg, msg = sent[0]
check(msg["To"] == "inflightreports@navdeck.online", "sent to inflightreports@navdeck.online")
check("BAW123" in msg["Subject"] and "EGKK-EGLL" in msg["Subject"], "subject names the flight and route")
attachments = [p for p in msg.iter_attachments()]
check(len(attachments) == 1 and attachments[0].get_content_type() == "application/pdf" and attachments[0].get_content() == pdf, "PDF attached unchanged")

r = client.post("/api/efb/reports", files={"file": ("log.pdf", pdf, "application/pdf")}, data=fields)
check(r.status_code == 200 and r.json().get("duplicate") and len(sent) == 1, "a retried report is not emailed twice")

big = b"%PDF-" + b"0" * (efb_reports.MAX_BYTES + 10)
r = client.post("/api/efb/reports", files={"file": ("log.pdf", big, "application/pdf")}, data={**fields, "report_id": "big"})
check(r.status_code == 413, "rejects oversized files")

statuses = [client.post("/api/efb/reports", files={"file": ("log.pdf", pdf, "application/pdf")}, data={**fields, "report_id": f"r{i}"}).status_code for i in range(25)]
check(429 in statuses, "limits how many reports one connection can send")

print("ALL EFB REPORT CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED")
sys.exit(1 if failures else 0)
