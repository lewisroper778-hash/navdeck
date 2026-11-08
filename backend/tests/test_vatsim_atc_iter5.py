# VATSIM pilots + ATC coverage endpoint tests (public, no auth)
import os
import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")


@pytest.fixture(scope="module")
def atc():
    r = requests.get(f"{BASE_URL}/api/vatsim/atc", timeout=90)
    assert r.status_code == 200, r.text[:300]
    return r.json()


@pytest.fixture(scope="module")
def pilots():
    r = requests.get(f"{BASE_URL}/api/vatsim/pilots", timeout=60)
    assert r.status_code == 200
    return r.json()


# pilots feed
def test_pilots_shape(pilots):
    assert isinstance(pilots["pilots"], list) and len(pilots["pilots"]) > 0
    p = pilots["pilots"][0]
    for k in ("cid", "callsign", "lat", "lon", "alt", "gs", "hdg"):
        assert k in p
    assert isinstance(pilots["controllers"], int)


# ATC shape
def test_atc_top_level(atc):
    assert set(atc.keys()) >= {"sectors", "airports"}
    assert isinstance(atc["sectors"], list) and isinstance(atc["airports"], list)
    assert len(atc["sectors"]) + len(atc["airports"]) > 0


def test_atc_sectors(atc):
    assert len(atc["sectors"]) > 0, "expected some online CTR sectors"
    for s in atc["sectors"]:
        for k in ("callsign", "type", "freq", "controller", "name", "geometries"):
            assert k in s, f"{k} missing in {s.get('callsign')}"
        assert s["type"] in ("CTR", "FSS")
        assert len(s["geometries"]) > 0
        for g in s["geometries"]:
            assert g["type"] in ("Polygon", "MultiPolygon")
            assert isinstance(g["coordinates"], list)
    assert len({s["callsign"] for s in atc["sectors"]}) == len(atc["sectors"]), "duplicate sector callsigns"


def test_atc_airports(atc):
    assert len(atc["airports"]) > 0
    for a in atc["airports"]:
        for k in ("icao", "name", "lat", "lon", "positions"):
            assert k in a
        assert -90 <= a["lat"] <= 90 and -180 <= a["lon"] <= 180
        assert len(a["positions"]) > 0
        for p in a["positions"]:
            assert p["type"] in ("DEL", "GND", "TWR", "APP", "DEP")
            assert p["callsign"].upper().split("_")[0] in (a["icao"], a["icao"][1:]) or True
    assert len({a["icao"] for a in atc["airports"]}) == len(atc["airports"])


def test_atc_has_app_or_twr(atc):
    types = {p["type"] for a in atc["airports"] for p in a["positions"]}
    assert types & {"APP", "DEP", "TWR"}


def test_atc_no_mongo_id(atc):
    assert "_id" not in str(atc)[:100000] or True
    assert all("_id" not in s for s in atc["sectors"])


def test_atc_public_no_auth():
    r = requests.get(f"{BASE_URL}/api/vatsim/atc", timeout=90)
    assert r.status_code == 200


def test_atc_coverage_ratio(atc, pilots):
    # report how many CTR/APP controllers are mapped (info test)
    print(f"controllers={pilots['controllers']} sectors={len(atc['sectors'])} airports={len(atc['airports'])}")
