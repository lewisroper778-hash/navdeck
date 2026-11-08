import time

import requests

VATSPY = "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/"
_ref = {"at": 0, "data": None}
APT_TYPES = {"DEL", "GND", "TWR", "APP", "DEP"}
TRACONS = {"SCT": "KLAX", "PCT": "KIAD", "D10": "KDFW", "I90": "KIAH", "HNL": "PHNL", "N90": "KJFK", "A80": "KATL", "C90": "KORD",
           "NCT": "KSFO", "L30": "KLAS", "P50": "KPHX", "D01": "KDEN", "A90": "KBOS", "F11": "KMCO", "S46": "KSEA", "M98": "KMSP",
           "D21": "KDTW", "T75": "KSTL", "P80": "KPDX", "S56": "KSLC", "R90": "KOMA", "Y90": "KBDL", "MUNSTER": "EDDG"}


def _load_reference():
    if _ref["data"] and time.time() - _ref["at"] < 86400:
        return _ref["data"]
    dat = requests.get(VATSPY + "VATSpy.dat", timeout=20).text
    geo = requests.get(VATSPY + "Boundaries.geojson", timeout=30).json()
    airports, lids, firs, uirs, section = {}, {}, {}, {}, None
    for line in dat.splitlines():
        line = line.strip()
        if not line or line.startswith(";"):
            continue
        if line.startswith("["):
            section = line
            continue
        p = line.split("|")
        if section == "[Airports]" and len(p) >= 7 and p[6] == "0":
            airports[p[0]] = {"icao": p[0], "name": p[1], "lat": float(p[2]), "lon": float(p[3]), "fir": p[5]}
            if p[4]:
                lids.setdefault(p[4], p[0])
        elif section == "[FIRs]" and len(p) >= 4:
            for key in {p[2], p[0]} - {""}:
                firs.setdefault(key, {"name": p[1], "boundary": p[3] or p[0]})
        elif section == "[UIRs]" and len(p) >= 3:
            uirs[p[0]] = {"name": p[1], "firs": p[2].split(",")}
    bounds = {}
    for f in geo["features"]:
        g = f["geometry"]
        bounds.setdefault(f["properties"]["id"], {"type": g["type"], "coordinates": _round(g["coordinates"])})
    _ref.update(at=time.time(), data={"airports": airports, "lids": lids, "firs": firs, "uirs": uirs, "bounds": bounds})
    return _ref["data"]


def _round(c):
    return [_round(x) for x in c] if isinstance(c[0], list) else [round(c[0], 2), round(c[1], 2)]


def _sector(ref, parts):
    for key in ("_".join(parts), parts[0]):
        if key in ref["firs"]:
            fir = ref["firs"][key]
            return fir["name"], [fir["boundary"]]
        if key in ref["uirs"]:
            uir = ref["uirs"][key]
            return uir["name"], [ref["firs"].get(x, {"boundary": x})["boundary"] for x in uir["firs"]]
    apt = ref["airports"].get(ref["lids"].get(parts[0]) or parts[0])
    if apt and apt["fir"] in ref["firs"]:
        return _sector(ref, [apt["fir"]])
    return None, []


def build_atc(controllers):
    ref = _load_reference()
    sectors, airports = [], {}
    for c in controllers:
        parts = [x for x in c["callsign"].upper().split("_") if x]
        kind = parts[-1]
        pos = {"callsign": c["callsign"], "type": kind, "freq": c.get("frequency"), "controller": c.get("name")}
        if kind in ("CTR", "FSS") and len(parts) > 1:
            name, ids = _sector(ref, parts[:-1])
            geoms = [ref["bounds"][i] for i in ids if i in ref["bounds"]]
            if geoms:
                sectors.append(pos | {"name": name, "geometries": geoms})
        elif kind in APT_TYPES:
            code = parts[0]
            icao = TRACONS.get(code) or (code if code in ref["airports"] else ref["lids"].get(code) or ("K" + code if "K" + code in ref["airports"] else None))
            if icao and icao in ref["airports"]:
                apt = airports.setdefault(icao, ref["airports"][icao] | {"positions": []})
                apt["positions"].append(pos)
    return {"sectors": sectors, "airports": list(airports.values())}
