"""Desktop in-flight reporting requirements, independent of FastAPI.

The main website keeps its original completion rules until explicitly migrated.
These additional requirements apply to desktop report sign-off and closing.
"""

from __future__ import annotations

import re
from typing import Any

HHMM = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _valid_amount(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    try:
        number = float(value)
        return number >= 0 and number < float("inf")
    except (TypeError, ValueError, OverflowError):
        return False


def desktop_report_blockers(flight: dict) -> list[str]:
    """Missing required in-flight actuals before signing or closing.

    Skipped route fixes (e.g. ATC direct) are excluded, but no imported
    waypoint information at all is not a valid completed flight report.
    """
    issues: list[str] = []
    active = [w for w in (flight.get("waypoints") or [])
              if not w.get("skipped")]
    if not active:
        issues.append("Imported waypoint route")
    for n, wp in enumerate(active, 1):
        ident = str(wp.get("ident") or f"FIX {n}")[:20]
        if not HHMM.fullmatch(str(wp.get("ata") or "")):
            issues.append(f"{ident}: actual waypoint time (ATA)")
        if not _valid_amount(wp.get("actual_fob")):
            issues.append(f"{ident}: actual fuel on board")
        if not _valid_amount(wp.get("actual_alt")) or                 float(wp["actual_alt"]) > 60000:
            issues.append(f"{ident}: actual altitude")
    if not _valid_amount(flight.get("arrival_fob")):
        issues.append("Arrival fuel on board at gate")
    return issues


def desktop_signoff_blockers(flight: dict) -> list[str]:
    issues = desktop_report_blockers(flight)
    times = flight.get("times") or {}
    for field, label in (
        ("off", "Gate-out UTC"),
        ("takeoff", "Takeoff UTC"),
        ("landing", "Landing UTC"),
        ("on", "Gate-in UTC"),
    ):
        if not HHMM.fullmatch(str(times.get(field) or "")):
            issues.append(label)
    if not _valid_amount(flight.get("landing_rate")):
        issues.append("Landing rate")
    return issues
