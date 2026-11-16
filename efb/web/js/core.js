// Shared state, server API, units and formatting for NAVDECK EFB.

export const S = {
  flight: null, settings: null, library: null, history: [],
  sim: { connected: false }, info: {}, notices: [],
};
const listeners = { doc: [], sim: [], notify: [] };
export const on = (type, fn) => listeners[type].push(fn);
const emit = (type, arg) => listeners[type].forEach(fn => fn(arg));

// ---------------------------------------------------------------- document operations
// The same three operations are applied here (instantly), on the host, and on every other device.
export function applyOp(root, op) {
  const path = op.path;
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (node[key] === null || typeof node[key] !== 'object')
      node[key] = typeof path[i + 1] === 'number' ? [] : {};
    node = node[key];
  }
  const last = path[path.length - 1];
  if (op.op === 'set') node[last] = op.value;
  else if (op.op === 'push') {
    if (!Array.isArray(node[last])) node[last] = [];
    node[last].push(op.value);
  } else if (op.op === 'del') {
    if (Array.isArray(node)) node.splice(last, 1);
    else delete node[last];
  }
}

export async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    if (options.raw) init.body = options.body;
    else { init.body = JSON.stringify(options.body); init.headers['Content-Type'] = 'application/json'; }
  }
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error || message; } catch { /* plain error */ }
    throw new Error(message);
  }
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res;
}

let queue = Promise.resolve();
export function patch(doc, ...ops) {
  ops.forEach(op => applyOp(S[doc], op));
  emit('doc', doc);
  queue = queue.then(() => api('/api/patch', { method: 'POST', body: { doc, ops } }))
    .catch(err => toastError('Not saved: ' + err.message));
  return queue;
}
export const set = (doc, path, value) => patch(doc, { op: 'set', path, value });
export const push = (doc, path, value) => patch(doc, { op: 'push', path, value });
export const del = (doc, path) => patch(doc, { op: 'del', path });
export const setF = (path, value) => set('flight', path, value);
export const setS = (path, value) => set('settings', path, value);

let toastError = msg => console.error(msg);
export const onError = fn => { toastError = fn; };

export const DEFAULT_SETTINGS = {
  theme: 'night', units: { weight: 'kg', volume: 'l', alt: 'ft', press: 'hpa' }, clock: 'auto',
  simbriefUser: '', picName: '', fuelCheckOn: true, fuelCheckMin: 30, hideTocTod: false, autoMessages: true,
  tabs: null, profiles: [], activeProfile: '', gsx: { host: '127.0.0.1', port: 8380, path: '/' },
  currency: 'EUR', fuelPrice: 0.95, fuelDensity: 0.8, customDelays: [], company: '', companyEmail: '',
};
function normalize() {
  const st = S.settings || {};
  S.settings = { ...DEFAULT_SETTINGS, ...st, units: { ...DEFAULT_SETTINGS.units, ...(st.units || {}) }, gsx: { ...DEFAULT_SETTINGS.gsx, ...(st.gsx || {}) } };
  S.library = { pins: {}, colors: {}, last: {}, ink: {}, pagePins: {}, night: {}, ...(S.library || {}) };
  const f = S.flight || (S.flight = blankFlight());
  const b = blankFlight();
  for (const k of Object.keys(b)) if (f[k] == null && b[k] != null && k !== 'id' && k !== 'created') f[k] = b[k];
  f.times = { ...b.times, ...f.times }; f.fuel = { ...b.fuel, ...f.fuel };
  f.occ = { messages: {}, turnaround: {}, delays: [], ...(f.occ || {}) };
  if (Array.isArray(f.occ.messages)) f.occ.messages = {};
  if (Array.isArray(f.occ.turnaround)) f.occ.turnaround = {};
  f.gsx = { receipts: [], ...(f.gsx || {}) };
}

export async function loadState() {
  const state = await api('/api/state');
  Object.assign(S, { flight: state.flight, settings: state.settings, library: state.library || {},
    history: state.history || [], sim: state.sim || { connected: false }, info: state.info || {} });
  normalize();
  syncClock();
}

// Shows another flight (from the logbook) in place of the current one, for the report page.
export function useFlight(doc) { S.flight = doc; normalize(); }

export function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'sim') { S.sim = msg.d; syncClock(); emit('sim', S.sim); }
    else if (msg.t === 'doc') { S[msg.doc] = msg.d; normalize(); emit('doc', msg.doc); }
    else if (msg.t === 'history') { S.history = msg.d; emit('doc', 'history'); }
    else if (msg.t === 'notify') { addNotice(msg.d); }
  };
  es.onerror = () => { if (S.sim.connected) { S.sim = { connected: false, hostLost: true }; emit('sim', S.sim); } };
}

export function addNotice(n) {
  const notice = { id: uid(), time: nowIso(), kind: 'info', ...n };
  S.notices.unshift(notice);
  if (S.notices.length > 60) S.notices.pop();
  emit('notify', notice);
}

// ---------------------------------------------------------------- clock (real or simulator time)
let clockOffset = 0;
function syncClock() {
  const mode = S.settings?.clock || 'auto';
  const simUtc = S.sim?.simUtc ? Date.parse(S.sim.simUtc) : NaN;
  if (mode === 'real' || !S.sim?.connected || !Number.isFinite(simUtc)) { clockOffset = 0; return; }
  const diff = simUtc - Date.now();
  clockOffset = mode === 'sim' || Math.abs(diff) > 120000 ? diff : 0;
}
export const usingSimClock = () => clockOffset !== 0;
export const now = () => new Date(Date.now() + clockOffset);
export const nowIso = () => now().toISOString();

// ---------------------------------------------------------------- units (stored: kg, feet, hPa)
export const KG_LB = 2.2046226218;
const U = () => S.settings?.units || {};
export const wUnit = () => (U().weight === 'lb' ? 'lb' : 'kg');
export const toW = kg => (kg == null ? null : U().weight === 'lb' ? kg * KG_LB : kg);
export const fromW = v => (v == null ? null : U().weight === 'lb' ? v / KG_LB : v);
export const num = (v, digits = 0) => (v == null || !Number.isFinite(+v) ? '--'
  : (+v).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
export const fmtW = (kg, unit = true) => (kg == null ? '--' : num(toW(kg)) + (unit ? ' ' + wUnit() : ''));
export const fmtSignedW = kg => (kg == null ? '--' : (kg >= 0 ? '+' : '−') + num(Math.abs(toW(kg))));
export function fmtVol(kg) {            // fuel volume from weight (Jet A-1, 0.8 kg/l)
  if (kg == null) return '--';
  const litres = kg / (S.settings?.fuelDensity || 0.8);
  return U().volume === 'usg' ? num(litres / 3.785411784) + ' USG' : num(litres) + ' l';
}
export const fmtAlt = ft => (ft == null ? '--' : U().alt === 'm' ? num(ft * 0.3048) + ' m' : num(ft) + ' ft');
export const fmtPress = hpa => (hpa == null ? '--' : U().press === 'inhg' ? num(hpa * 0.0295299830714, 2) + ' inHg' : num(hpa) + ' hPa');

// ---------------------------------------------------------------- time helpers
const pad = n => String(n).padStart(2, '0');
export function fmtT(iso, seconds = false) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d)) return '--:--';
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + (seconds ? ':' + pad(d.getUTCSeconds()) : '');
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : pad(d.getUTCDate()) + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
export function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '--:--';
  const sign = ms < 0 ? '−' : '';
  const m = Math.round(Math.abs(ms) / 60000);
  return sign + Math.floor(m / 60) + ':' + pad(m % 60);
}
export const diffMs = (a, b) => (a && b ? Date.parse(b) - Date.parse(a) : null);
// "1432" typed on the keypad becomes a UTC time close to the reference moment.
export function hhmmToIso(text, refIso) {
  const digits = String(text).replace(/\D/g, '').padStart(4, '0').slice(-4);
  const h = +digits.slice(0, 2), m = +digits.slice(2);
  if (h > 23 || m > 59) return null;
  const ref = refIso ? new Date(refIso) : now();
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), h, m));
  const delta = d - ref;
  if (delta > 12 * 3600000) d.setUTCDate(d.getUTCDate() - 1);
  if (delta < -12 * 3600000) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// ---------------------------------------------------------------- small DOM helper
// append() and replaceChildren() accept nested lists and skip null/false, the same as h() does,
// so conditional pieces (cond && element) can be passed anywhere.
for (const name of ['append', 'replaceChildren']) {
  const native = Element.prototype[name];
  Element.prototype[name] = function (...kids) {
    return native.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false));
  };
}
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ---------------------------------------------------------------- flight document
export function blankFlight() {
  return {
    id: uid(), created: new Date().toISOString(), profile: '',
    callsign: '', flightNo: '', airline: '', reg: '', type: '', dep: '', arr: '', altn: '', route: '',
    depName: '', arrName: '', distanceNm: null, costIndex: '', cruiseFl: '',
    times: { std: null, sta: null, out: null, off: null, on: null, in: null, tsat: null, ctot: null, planBlockMin: null, planAirMin: null },
    fuel: { out: null, off: null, on: null, in: null, planRamp: null, planTakeoff: null, planLanding: null, planTaxi: null, planTrip: null, planAltn: null, planReserve: null, uplift: null },
    navlog: [], fuelChecks: [], lastFuelCheck: null,
    landing: null, goArounds: [], diversion: null,
    occ: { messages: {}, turnaround: {}, delays: [] },
    load: null, gsx: { receipts: [] },
    crew: [], safety: [], movement: [],
    closed: null,
  };
}
export const stageName = s => ['Parked', 'Taxi out', 'Airborne', 'Taxi in', 'Arrived'][s ?? 0] || 'Parked';
export const flightTitle = f => (f?.dep || '----') + ' → ' + (f?.arr || '----');
