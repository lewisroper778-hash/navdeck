// Turns a SimBrief OFP (JSON) into a NAVDECK EFB flight document. Weights are converted to kilograms.
import { blankFlight, KG_LB } from './core.js';

const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
const s = v => (v == null || typeof v === 'object' ? '' : String(v));
const unix = v => { const x = n(v); return x ? new Date(x * 1000).toISOString() : null; };

// Turns a SimBrief XML flight plan into the same shape as the JSON one.
export function ofpFromXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not a valid SimBrief XML flight plan.');
  const walk = el => {
    const kids = [...el.children];
    if (!kids.length) return el.textContent.trim();
    const out = {};
    for (const k of kids) {
      const v = walk(k);
      if (k.tagName in out) { if (!Array.isArray(out[k.tagName])) out[k.tagName] = [out[k.tagName]]; out[k.tagName].push(v); }
      else out[k.tagName] = v;
    }
    return out;
  };
  return walk(doc.documentElement);
}

// Reads a SimBrief file (.json or .xml) chosen on this device.
export async function ofpFromFile(file) {
  const text = (await file.text()).trim();
  let ofp;
  if (text.startsWith('{')) {
    try { ofp = JSON.parse(text); } catch { throw new Error('This file is not a valid SimBrief JSON flight plan.'); }
  } else if (text.startsWith('<')) ofp = ofpFromXml(text);
  else throw new Error('Choose a SimBrief flight plan saved as JSON or XML.');
  if (!ofp?.origin?.icao_code || !ofp?.destination?.icao_code) throw new Error('No departure and destination found in this file. Is it a SimBrief flight plan?');
  return ofp;
}

export function flightFromOfp(ofp) {
  const f = blankFlight();
  const kg = v => { const x = n(v); return x == null ? null : (s(ofp.params?.units).toLowerCase().startsWith('lb') ? x / KG_LB : x); };
  const g = ofp.general || {}, o = ofp.origin || {}, d = ofp.destination || {}, a = ofp.aircraft || {};
  const alt = Array.isArray(ofp.alternate) ? ofp.alternate[0] : ofp.alternate;
  const t = ofp.times || {}, fu = ofp.fuel || {}, w = ofp.weights || {};

  f.airline = s(g.icao_airline);
  f.flightNo = s(g.icao_airline) + s(g.flight_number);
  f.callsign = s(ofp.atc?.callsign) || f.flightNo;
  f.reg = s(a.reg);
  f.type = s(a.icaocode) || s(a.icao_code);
  f.dep = s(o.icao_code); f.depName = s(o.name); f.depRwy = s(o.plan_rwy);
  f.arr = s(d.icao_code); f.arrName = s(d.name); f.arrRwy = s(d.plan_rwy);
  f.altn = s(alt?.icao_code); f.altnName = s(alt?.name);
  f.route = s(g.route);
  f.distanceNm = n(g.route_distance) ?? n(g.air_distance);
  f.costIndex = s(g.costindex);
  f.cruiseFl = n(g.initial_altitude) ? 'FL' + Math.round(n(g.initial_altitude) / 100) : '';

  f.times.std = unix(t.sched_out);
  f.times.sta = unix(t.sched_in);
  f.times.planBlockMin = n(t.sched_block) != null ? Math.round(n(t.sched_block) / 60) : null;
  f.times.planAirMin = n(t.est_time_enroute) != null ? Math.round(n(t.est_time_enroute) / 60) : null;

  Object.assign(f.fuel, {
    planRamp: kg(fu.plan_ramp), planTakeoff: kg(fu.plan_takeoff), planLanding: kg(fu.plan_landing),
    planTaxi: kg(fu.taxi), planTrip: kg(fu.enroute_burn), planAltn: kg(fu.alternate_burn), planReserve: kg(fu.reserve),
  });

  const fixes = ofp.navlog?.fix ? (Array.isArray(ofp.navlog.fix) ? ofp.navlog.fix : [ofp.navlog.fix]) : [];
  fixes.forEach((x, i) => {
    const ident = s(x.ident);
    if (i === 0 && ident === f.dep) return;                 // the departure airport is not "passed"
    const lat = n(x.pos_lat), lon = n(x.pos_long);
    f.navlog.push({
      ident, name: s(x.name), via: s(x.via_airway),
      type: ident === 'TOC' ? 'toc' : ident === 'TOD' ? 'tod' : s(x.type) === 'apt' ? 'apt' : 'wpt',
      lat, lon, planT: n(x.time_total), planFob: kg(x.fuel_plan_onboard), planAlt: n(x.altitude_feet),
      distNm: n(x.distance), eto: null, ata: null, fob: null, alt: null, auto: false,
    });
  });

  f.plan = {
    seats: n(a.max_passengers) ?? n(w.pax_count_actual) ?? n(w.pax_count) ?? 180,
    pax: n(w.pax_count_actual) ?? n(w.pax_count) ?? 0,
    bags: n(w.bag_count_actual) ?? n(w.bag_count) ?? null,
    cargo: kg(w.cargo) ?? 0, paxWeight: kg(w.pax_weight) ?? 84, bagWeight: kg(w.bag_weight) ?? 15,
    oew: kg(w.oew), estZfw: kg(w.est_zfw), estTow: kg(w.est_tow), estLdw: kg(w.est_ldw),
    maxZfw: kg(w.max_zfw), maxTow: kg(w.max_tow), maxLdw: kg(w.max_ldw),
  };

  const crew = ofp.crew || {};
  const add = (role, name) => { if (s(name)) f.crew.push({ role, name: s(name) }); };
  add('PIC', crew.cpt); add('FO', crew.fo); add('Purser', crew.pu);
  (Array.isArray(crew.fa) ? crew.fa : crew.fa ? [crew.fa] : []).forEach(x => add('Cabin crew', x));
  return f;
}

// Planned clock time and planned FOB at any moment, interpolated along the navlog.
export function planAt(flight, iso) {
  if (!flight.times.off || !iso) return null;
  const t = (Date.parse(iso) - Date.parse(flight.times.off)) / 1000;
  const pts = [{ planT: 0, planFob: flight.fuel.planTakeoff }, ...flight.navlog].filter(p => p.planT != null && p.planFob != null);
  if (pts.length < 2) return null;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].planT) {
      const a = pts[i - 1], b = pts[i], k = b.planT === a.planT ? 0 : (t - a.planT) / (b.planT - a.planT);
      return a.planFob + (b.planFob - a.planFob) * Math.max(0, k);
    }
  }
  return pts[pts.length - 1].planFob;
}
