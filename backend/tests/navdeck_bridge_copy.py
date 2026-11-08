"""NAVDECK Sim Link for Microsoft Flight Simulator 2020 / 2024.

Reads your aircraft through SimConnect and fills in gate-out, takeoff, landing
(with touchdown rate) and gate-in on your open NAVDECK flight.

Setup (Windows, once):
    1. Install Python 3.10+ from python.org (tick "Add Python to PATH").
    2. In a terminal:  pip install SimConnect
    3. Run:            python navdeck-bridge.py
    4. Paste the connection code from NAVDECK > SimBrief page > Simulator link.

Test without the simulator:  python navdeck-bridge.py --simulate
"""

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path(__file__).with_name("navdeck-bridge.json")
POLL = 0.05  # seconds between samples (20 Hz) so the touchdown rate is precise
HEARTBEAT = 30


def zulu():
    return datetime.now(timezone.utc).strftime("%H:%M")


def load_code():
    if CONFIG.exists():
        code = json.loads(CONFIG.read_text()).get("code", "")
        if "#" in code:
            return code
    code = input("Paste your NAVDECK connection code: ").strip()
    if "#" not in code:
        sys.exit("That doesn't look like a NAVDECK connection code. Create one on the SimBrief page in NAVDECK.")
    CONFIG.write_text(json.dumps({"code": code}))
    return code


class Navdeck:
    def __init__(self, code):
        self.base, self.token = code.split("#", 1)
        self.base = self.base.rstrip("/")

    def call(self, method, path, body=None):
        req = urllib.request.Request(f"{self.base}/api/bridge{path}", method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"X-Bridge-Token": self.token, "Content-Type": "application/json", "User-Agent": "navdeck-bridge/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            detail = json.loads(e.read() or b"{}").get("detail", e.reason)
            if e.code == 401:
                CONFIG.unlink(missing_ok=True)
                sys.exit(f"NAVDECK rejected the connection code: {detail}")
            print(f"  ! NAVDECK: {detail}")
        except urllib.error.URLError as e:
            print(f"  ! Can't reach NAVDECK ({e.reason}); will retry on the next event")
        return None

    def send(self, kind, **extra):
        res = self.call("POST", "/event", {"type": kind, "time": zulu(), **extra})
        if res is not None:
            what = ", ".join(res.get("applied") or []) or "nothing new (already filled in)"
            print(f"  -> {kind.upper()} {zulu()}z sent · updated: {what}")


class Tracker:
    """Turns raw sim samples into gate-out / takeoff / landing / gate-in events."""

    def __init__(self, nav):
        self.nav, self.stage = nav, "parked"
        self.last_air_vs = 0
        self.still_since = None

    def update(self, on_ground, gs, vs, brake, fuel_lb):
        if not on_ground:
            self.last_air_vs = vs
        if self.stage == "parked" and on_ground and gs > 3:
            self.stage = "taxi_out"
            self.nav.send("off")
        elif self.stage == "taxi_out" and not on_ground and gs > 40:
            self.stage = "airborne"
            self.nav.send("takeoff")
        elif self.stage == "airborne" and on_ground:
            # Rate at contact: vertical speed of the last airborne sample (20 Hz, so within 50 ms of touchdown)
            rate = abs(self.last_air_vs)
            self.stage = "taxi_in"
            print(f"  ** Touchdown at {round(rate)} fpm")
            self.nav.send("landing", landing_rate=round(rate))
        elif self.stage == "taxi_in":
            if on_ground and gs < 1 and brake:
                self.still_since = self.still_since or time.time()
                if time.time() - self.still_since > 5:
                    self.stage = "done"
                    self.nav.send("on", fuel_lb=round(fuel_lb) if fuel_lb else None)
                    print("Flight complete. Close it in NAVDECK when you're ready.")
            else:
                self.still_since = None


def run_sim(nav):
    try:
        from SimConnect import AircraftRequests, SimConnect
    except ImportError:
        sys.exit("SimConnect isn't installed. Run:  pip install SimConnect")
    print("Waiting for Microsoft Flight Simulator…")
    while True:
        try:
            sm = SimConnect()
            break
        except Exception:
            time.sleep(5)
    aq = AircraftRequests(sm, _time=0)
    title = aq.get("TITLE")
    title = title.decode(errors="ignore") if isinstance(title, bytes) else title
    print(f"Connected to MSFS · {title or 'aircraft'}")
    nav.call("POST", "/heartbeat", {"sim": "MSFS", "aircraft": title, "connected": True})
    tracker, beat = Tracker(nav), time.time()
    try:
        while tracker.stage != "done":
            on_ground = bool(aq.get("SIM_ON_GROUND"))
            gs = aq.get("GROUND_VELOCITY") or 0
            vs = aq.get("VERTICAL_SPEED") or 0  # feet per minute
            brake = (aq.get("BRAKE_PARKING_POSITION") or 0) > 0.5
            tracker.update(on_ground, gs, vs, brake, aq.get("FUEL_TOTAL_QUANTITY_WEIGHT"))
            if time.time() - beat > HEARTBEAT:
                nav.call("POST", "/heartbeat", {"sim": "MSFS", "aircraft": title, "connected": True})
                beat = time.time()
            time.sleep(POLL)
    finally:
        nav.call("POST", "/heartbeat", {"sim": "MSFS", "aircraft": title, "connected": False})
        sm.exit()


def run_demo(nav):
    print("Simulated flight: gate out, takeoff, landing at 142 fpm, gate in (about 20 seconds)")
    nav.call("POST", "/heartbeat", {"sim": "Test flight", "aircraft": "Simulated A320", "connected": True})
    t = Tracker(nav)
    script = [(True, 0, 0, True)] * 5 + [(True, 12, 0, False)] * 20 + [(False, 150, 1800, False)] * 20 + \
             [(False, 140, v, False) for v in (-700, -400, -220, -160, -142)] + [(True, 120, -60, False)] + \
             [(True, 20, 0, False)] * 10 + [(True, 0, 0, True)] * 140
    for on_ground, gs, vs, brake in script:
        t.update(on_ground, gs, vs, brake, 9800)
        time.sleep(POLL)
        if t.stage == "done":
            break
    nav.call("POST", "/heartbeat", {"sim": "Test flight", "aircraft": "Simulated A320", "connected": False})


if __name__ == "__main__":
    nav = Navdeck(load_code())
    flight = (nav.call("GET", "/flight") or {}).get("flight")
    print(f"Sending to: {flight['callsign']} {flight['origin']} -> {flight['destination']}" if flight else "No open flight in NAVDECK yet. Import one from SimBrief before you push back.")
    run_demo(nav) if "--simulate" in sys.argv else run_sim(nav)
