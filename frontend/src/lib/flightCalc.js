import { addSecondsToHHMM, diffMin } from "@/lib/utils-app";

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

// Display-unit conversion; everything is stored in the OFP's own units.
export function unitTools(f) {
  const ofp = f.weights?.ofp_units || "KG";
  const units = f.weights?.units || ofp;
  const factor = units === ofp ? 1 : ofp === "KG" ? 2.20462 : 0.453592;
  return {
    units,
    ofp,
    toDisp: (v) => (num(v) === null ? null : Math.round(num(v) * factor)),
    toOfp: (v) => (num(v) === null ? null : Math.round(num(v) / factor)),
  };
}

export function computeNavlog(f) {
  const t = f.times || {};
  const base = t.takeoff || t.sched_takeoff || null;
  let last = null;
  return f.waypoints.map((w) => {
    const planned = base && w.eta ? addSecondsToHHMM(base, w.eta) : null;
    const fob = num(w.fob);
    const act = num(w.actual_fob);
    let row;
    if (w.ata) {
      row = {
        planned,
        eto: w.ata,
        timeDev: planned ? diffMin(w.ata, planned) : null,
        fuelDev: act !== null && fob !== null ? act - fob : null,
        estFob: act ?? fob,
      };
      last = { ata: w.ata, eta: num(w.eta) || 0, fuelDev: row.fuelDev ?? last?.fuelDev ?? 0 };
    } else {
      const eto = last ? addSecondsToHHMM(last.ata, (num(w.eta) || 0) - last.eta) : planned;
      row = {
        planned,
        eto,
        timeDev: last && planned ? diffMin(eto, planned) : null,
        fuelDev: null,
        estFob: fob !== null ? fob + (last?.fuelDev || 0) : null,
      };
    }
    return { ...w, ...row };
  });
}

export function computeFuel(f, rows) {
  const fuel = f.fuel || {};
  const minFuel = num(fuel.min_fuel) ?? (num(fuel.alternate) || 0) + (num(fuel.reserve) || 0);
  const mayday = num(fuel.mayday_fuel) ?? num(fuel.reserve) ?? 0;
  const burnHr = num(fuel.avg_burn_per_hour);
  const lastPlanned = rows.length ? num(rows[rows.length - 1].fob) : null;
  const loggedDevs = rows.filter((r) => r.fuelDev !== null);
  const dev = loggedDevs.length ? loggedDevs[loggedDevs.length - 1].fuelDev : 0;
  const landing = lastPlanned !== null ? lastPlanned + dev : null;
  const holdFuel = landing !== null ? landing - minFuel : null;
  const holdMin = holdFuel !== null && burnHr ? Math.max(0, Math.floor((holdFuel / burnHr) * 60)) : null;
  let state = "NORMAL";
  if (landing !== null) {
    if (landing < mayday) state = "MAYDAY FUEL";
    else if (landing < minFuel) state = "MINIMUM FUEL";
  }
  return { minFuel, mayday, burnHr, landing, holdFuel, holdMin, dev, state };
}

export function computeWeights(f) {
  const w = f.weights || {};
  const fuel = f.fuel || {};
  const paxW = num(w.pax_weight) || 0;
  const pax = num(w.pax_count) || 0;
  const cargo = num(w.cargo) || 0;
  const plannedPayload = num(w.payload);
  const payload = paxW ? pax * paxW + cargo : plannedPayload;
  const oew = num(w.oew);
  const zfw = oew !== null && payload !== null ? oew + payload : num(w.zfw);
  const takeoffFuel = (num(fuel.block) || 0) - (num(fuel.taxi) || 0);
  const tow = zfw !== null ? zfw + takeoffFuel : num(w.tow);
  const law = tow !== null ? tow - (num(fuel.trip) || 0) : num(w.law);
  const check = (v, max) => ({ value: v, max: num(max), over: v !== null && num(max) !== null && v > num(max) });
  return {
    payload,
    zfw: check(zfw, w.max_zfw),
    tow: check(tow, w.max_tow),
    law: check(law, w.max_law),
  };
}
