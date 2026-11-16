"""Journey logs sent automatically by NAVDECK EFB, forwarded by email to the in-flight reports inbox.

The mail account's login stays on the server (environment variables), never in the app.
Configuration (in /opt/navdeck/email.env on the Oracle server, see deploy/oracle/README.md):
    EFB_SMTP_HOST, EFB_SMTP_PORT (587), EFB_SMTP_SECURITY (starttls | ssl | none),
    EFB_SMTP_USER, EFB_SMTP_PASSWORD, EFB_SMTP_FROM (defaults to the user),
    EFB_REPORTS_TO (defaults to inflightreports@navdeck.online)
"""
import asyncio
import os
import re
import smtplib
import ssl
import time
from collections import deque
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

DEFAULT_TO = "inflightreports@navdeck.online"
MAX_BYTES = 10 * 1024 * 1024
RATE_WINDOW_S = 3600
RATE_PER_SENDER = 20

_hits: dict[str, deque] = {}
_sent_ids: dict[str, float] = {}


def email_config() -> dict:
    user = os.environ.get("EFB_SMTP_USER", "").strip()
    return {
        "host": os.environ.get("EFB_SMTP_HOST", "").strip(),
        "port": int(os.environ.get("EFB_SMTP_PORT", "587") or 587),
        "security": os.environ.get("EFB_SMTP_SECURITY", "starttls").strip().lower(),
        "user": user,
        "password": os.environ.get("EFB_SMTP_PASSWORD", ""),
        "from": os.environ.get("EFB_SMTP_FROM", "").strip() or user,
        "to": os.environ.get("EFB_REPORTS_TO", "").strip() or DEFAULT_TO,
    }


def smtp_send(cfg: dict, message: EmailMessage) -> None:
    context = ssl.create_default_context()
    if cfg["security"] == "ssl":
        server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=context, timeout=30)
    else:
        server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=30)
    with server:
        if cfg["security"] == "starttls":
            server.starttls(context=context)
        if cfg["user"]:
            server.login(cfg["user"], cfg["password"])
        server.send_message(message)


def _clean(value: str, limit: int = 80) -> str:
    return re.sub(r"[^\w .,:/@+()\-]", "", (value or "").strip())[:limit]


def _client_key(request: Request) -> str:
    return (request.headers.get("x-real-ip") or (request.client.host if request.client else "") or "unknown")[:64]


def _rate_limited(key: str) -> bool:
    now = time.monotonic()
    hits = _hits.setdefault(key, deque())
    while hits and now - hits[0] > RATE_WINDOW_S:
        hits.popleft()
    if len(hits) >= RATE_PER_SENDER:
        return True
    hits.append(now)
    return False


def build_message(cfg: dict, pdf: bytes, flight: str, route: str, pic: str, closed_at: str,
                  app_version: str, report_id: str) -> EmailMessage:
    flight, route, pic = _clean(flight, 20), _clean(route, 30), _clean(pic, 60)
    title = " ".join(x for x in ("Journey log", flight, route) if x)
    message = EmailMessage()
    message["Subject"] = title
    message["From"] = formataddr(("NAVDECK EFB", cfg["from"]))
    message["To"] = cfg["to"]
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain="navdeck.online")
    message.set_content(
        f"{title}\n\n"
        f"Flight: {flight or '-'}\n"
        f"Route: {route or '-'}\n"
        f"Pilot in command: {pic or '-'}\n"
        f"Closed: {_clean(closed_at, 40) or '-'}\n"
        f"App: NAVDECK EFB {_clean(app_version, 20) or '-'}\n"
        f"Report ID: {_clean(report_id, 40) or '-'}\n\n"
        "The signed journey log is attached as a PDF.\n"
    )
    filename = re.sub(r"[^\w.\-]+", "_", f"{title}.pdf")[:120]
    message.add_attachment(pdf, maintype="application", subtype="pdf", filename=filename)
    return message


def build_efb_reports_router(sender=smtp_send) -> APIRouter:
    router = APIRouter(prefix="/api/efb")

    @router.get("/reports/status")
    async def report_status():
        return {"configured": bool(email_config()["host"])}

    @router.post("/reports")
    async def receive_report(
        request: Request,
        file: UploadFile = File(...),
        flight: str = Form(""),
        route: str = Form(""),
        pic: str = Form(""),
        closed_at: str = Form(""),
        app_version: str = Form(""),
        report_id: str = Form(""),
    ):
        cfg = email_config()
        if not cfg["host"]:
            raise HTTPException(status_code=503, detail="Report email is not set up on the server yet.")
        if _rate_limited(_client_key(request)):
            raise HTTPException(status_code=429, detail="Too many reports from this connection. Try again later.")

        rid = _clean(report_id, 40)
        now = time.monotonic()
        for key, at in list(_sent_ids.items()):
            if now - at > 86400:
                del _sent_ids[key]
        if rid and rid in _sent_ids:
            return {"ok": True, "duplicate": True}      # a retry of a report that already went out

        pdf = await file.read(MAX_BYTES + 1)
        if len(pdf) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="The journey log is too large.")
        if not pdf.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Only PDF journey logs are accepted.")

        message = build_message(cfg, pdf, flight, route, pic, closed_at, app_version, rid)
        try:
            await asyncio.to_thread(sender, cfg, message)
        except Exception:
            raise HTTPException(status_code=502, detail="The journey log could not be emailed. It will be retried.")
        if rid:
            _sent_ids[rid] = now
        return {"ok": True}

    return router
