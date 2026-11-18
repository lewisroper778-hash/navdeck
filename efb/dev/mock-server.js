// Development stand-in for the Windows host: same API, with a scripted flight instead of the simulator.
// Usage: node efb/dev/mock-server.js [port]      then open http://localhost:8640
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = +process.argv[2] || 8640;
const WEB = path.join(__dirname, '..', 'web');
const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'navdeck-efb-lib-'));
// like the Windows host: the bundled QRH and FCOM manuals are in Documents from the start
const MANUALS = path.join(__dirname, '..', 'manuals');
if (fs.existsSync(MANUALS)) fs.cpSync(MANUALS, path.join(LIB, 'docs'), { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const state = { flight: { id: 'none', navlog: [], times: {}, fuel: {}, goArounds: [], fuelChecks: [], crew: [], safety: [], movement: [], occ: { messages: {}, turnaround: {}, delays: [] }, gsx: { receipts: [] } }, settings: {}, library: {}, safety: { reports: {} }, history: [], archive: {} };
let sim = { connected: false };
const clients = new Set();

function applyOp(root, op) {
  let node = root;
  const p = op.path;
  for (let i = 0; i < p.length - 1; i++) {
    if (node[p[i]] === null || typeof node[p[i]] !== 'object') node[p[i]] = typeof p[i + 1] === 'number' ? [] : {};
    node = node[p[i]];
  }
  const last = p[p.length - 1];
  if (op.op === 'set') node[last] = op.value;
  else if (op.op === 'push') { if (!Array.isArray(node[last])) node[last] = []; node[last].push(op.value); }
  else if (op.op === 'del') { if (Array.isArray(node)) node.splice(last, 1); else delete node[last]; }
}
const send = msg => { const data = `data: ${JSON.stringify(msg)}\n\n`; clients.forEach(c => c.write(data)); };
const pushDoc = doc => send({ t: 'doc', doc, d: state[doc] });
const notify = (title, text, kind = 'info') => send({ t: 'notify', d: { title, text, kind } });
const summary = f => ({ id: f.id, date: f.times.out || f.created, flightNo: f.flightNo, dep: f.dep, arr: f.arr, type: f.type,
  blockMs: f.times.out && f.times.in ? Date.parse(f.times.in) - Date.parse(f.times.out) : null, rate: f.landing ? f.landing.rate : null,
  burnKg: f.fuel.out != null && f.fuel.in != null ? f.fuel.out - f.fuel.in : null });

// ---------------------------------------------------------------- sample SimBrief plan
function sampleOfp() {
  const now = Math.floor(Date.now() / 1000);
  const fixes = [
    ['EGLL', 'apt', 51.4706, -0.4619, 0, 0, 7400], ['DET', 'vor', 51.304, 0.5973, 9000, 540, 6900], ['DVR', 'vor', 51.1625, 1.359, 17000, 900, 6500],
    ['TOC', 'wpt', 51.05, 1.9, 25000, 1140, 6250], ['KONAN', 'wpt', 51.1308, 2.0, 25000, 1200, 6200], ['KOK', 'vor', 51.0948, 2.6523, 25000, 1500, 6000],
    ['TOD', 'wpt', 51.3, 3.3, 25000, 1860, 5800], ['HELEN', 'wpt', 51.2353, 3.8686, 18000, 2100, 5700], ['SUGOL', 'wpt', 52.5253, 3.9672, 7000, 2700, 5450],
    ['EHAM', 'apt', 52.3086, 4.7639, 0, 3300, 5200],
  ];
  return {
    params: { units: 'kgs' }, general: { icao_airline: 'BAW', flight_number: '428', route: 'DET L6 DVR UL9 KONAN UL607 KOK HELEN SUGOL', route_distance: '231', costindex: '20', initial_altitude: '25000' },
    atc: { callsign: 'BAW428' }, aircraft: { icaocode: 'A20N', reg: 'G-TTNA', max_passengers: '180' },
    origin: { icao_code: 'EGLL', name: 'London Heathrow', plan_rwy: '27R' }, destination: { icao_code: 'EHAM', name: 'Amsterdam Schiphol', plan_rwy: '18R' },
    alternate: { icao_code: 'EHRD', name: 'Rotterdam' },
    times: { sched_out: String(now + 600), sched_in: String(now + 600 + 4800), sched_block: '4800', est_time_enroute: '3300' },
    fuel: { plan_ramp: '7600', plan_takeoff: '7400', plan_landing: '5200', taxi: '200', enroute_burn: '2200', alternate_burn: '900', reserve: '1100' },
    weights: { pax_count: '168', bag_count: '142', cargo: '1200', oew: '44300', est_zfw: '60100', est_tow: '67500', est_ldw: '65300', max_zfw: '64300', max_tow: '79000', max_ldw: '67400', pax_weight: '84', bag_weight: '15' },
    crew: { cpt: 'L ROPER', fo: 'A PATEL', pu: 'S MORGAN', fa: ['J DAVIES', 'K OBI'] },
    navlog: { fix: fixes.map(([ident, type, lat, lon, alt, t, fob]) => ({ ident, name: ident, type, pos_lat: String(lat), pos_long: String(lon), altitude_feet: String(alt), time_total: String(t), fuel_plan_onboard: String(fob), via_airway: 'DCT', distance: '30' })) },
  };
}

// ---------------------------------------------------------------- sample VATSIM traffic
function sampleVatsim() {
  const apts = [['EGLL', 51.47, -0.46], ['EHAM', 52.31, 4.76], ['LFPG', 49.01, 2.55], ['EDDF', 50.03, 8.56], ['LEMD', 40.47, -3.56], ['EIDW', 53.42, -6.27], ['EGKK', 51.15, -0.19], ['LIRF', 41.8, 12.24], ['KJFK', 40.64, -73.78], ['EGCC', 53.35, -2.27]];
  const types = ['A20N', 'B738', 'A321', 'B77W', 'A359', 'E190', 'B789', 'A320', 'C172'];
  const pilots = [];
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    const a = apts[Math.floor(r() * apts.length)], b = apts[Math.floor(r() * apts.length)];
    const k = r();
    pilots.push({ cid: 1000000 + i * 37, callsign: ['BAW', 'KLM', 'AFR', 'DLH', 'EZY', 'RYR', 'IBE', 'EIN'][i % 8] + (100 + i * 7), name: 'Pilot ' + (i + 1),
      lat: a[1] + (b[1] - a[1]) * k, lon: a[2] + (b[2] - a[2]) * k, alt: Math.round(r() * 38000), gs: Math.round(120 + r() * 360), hdg: Math.round(r() * 359),
      dep: a[0], arr: b[0] === a[0] ? 'EGLL' : b[0], aircraft: types[i % types.length] });
  }
  return { updated: new Date().toISOString(), fetched: new Date().toISOString(), pilots };
}

// ---------------------------------------------------------------- scripted flight (what the Windows host does from FSUIPC data)
function simStep(action) {
  const f = state.flight, iso = new Date().toISOString();
  const tele = extra => { sim = { connected: true, hasPosition: true, stage: 0, lat: 51.47, lon: -0.46, altFt: 80, gsKt: 0, vsFpm: 0, fobKg: 7600, onGround: true, simUtc: iso, aircraft: 'Airbus A320neo', ...sim, ...extra, connected: true }; send({ t: 'sim', d: sim }); };
  if (action === 'connect') tele({});
  else if (action === 'refuel') { f.fuel.uplift = 3100; f.gsx.receipts.push({ id: 'auto-fuel', time: iso, type: 'Fuel', text: '3,100 kg Jet A-1 uplift', amount: 2945, currency: 'EUR', auto: true }); notify('Receipt saved', 'Fuel uplift 3,100 kg'); pushDoc('flight'); }
  else if (action === 'out') { f.times.out = iso; f.fuel.out = 7580; tele({ stage: 1, gsKt: 14, fobKg: 7580 }); notify('Off blocks', 'Recorded automatically', 'good'); pushDoc('flight'); }
  else if (action === 'off') { f.times.off = iso; f.fuel.off = 7390; tele({ stage: 2, gsKt: 160, altFt: 900, onGround: false, fobKg: 7390, vsFpm: 2400 }); notify('Airborne', 'Take-off time recorded', 'good'); pushDoc('flight'); }
  else if (action === 'fix') {
    const i = f.navlog.findIndex(x => !x.ata);
    if (i >= 0) {
      const x = f.navlog[i], off = Date.parse(f.times.off);
      x.ata = new Date(off + (x.planT + 60 + i * 20) * 1000).toISOString();
      x.fob = Math.round(x.planFob + (i % 2 ? -140 - i * 12 : 90));
      x.alt = x.planAlt; x.auto = true;
      tele({ stage: 2, altFt: x.planAlt, gsKt: 430, fobKg: x.fob, onGround: false, lat: x.lat, lon: x.lon, nextDistNm: 24 });
      notify('Waypoint ' + x.ident, 'Time and fuel on board logged');
      pushDoc('flight');
    }
  } else if (action === 'fuelcheck') { f.fuelChecks.push({ time: iso, fob: sim.fobKg, plan: sim.fobKg + 120, auto: true }); f.lastFuelCheck = iso; notify('Fuel check', 'Recorded automatically'); pushDoc('flight'); }
  else if (action === 'touchandgo') { f.goArounds.push({ time: iso, raFt: 0, kind: 'touch-and-go', reason: '', remark: '' }); notify('Touch-and-go', 'The flight continues', 'warn'); pushDoc('flight'); }
  else if (action === 'goaround') { f.goArounds.push({ time: iso, raFt: 410, reason: '', remark: '' }); notify('Go-around detected', 'A reason is required before closing', 'warn'); pushDoc('flight'); }
  else if (action === 'on') {
    f.times.on = iso; f.fuel.on = 5290;
    f.landing = { rate: 164, runway: '18R', airport: 'EHAM', distFt: 1420, offsetFt: 6.5, lengthFt: 12467, widthFt: 197, gsKt: 134, lat: 52.36, lon: 4.71 };
    const last = f.navlog[f.navlog.length - 1];
    if (last && !last.ata) { last.ata = iso; last.fob = 5290; last.auto = true; }
    tele({ stage: 3, gsKt: 60, altFt: 0, onGround: true, fobKg: 5290 }); notify('Landed', '164 fpm on runway 18R', 'good'); pushDoc('flight');
  } else if (action === 'in') { f.times.in = iso; f.fuel.in = 5180; tele({ stage: 4, gsKt: 0, fobKg: 5180 }); notify('On blocks', 'Flight ready to sign and close', 'good'); pushDoc('flight'); }
}

// ---------------------------------------------------------------- http
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
const safe = p => { const full = path.normalize(path.join(LIB, p)); return full.startsWith(LIB) ? full : null; };
function listFiles(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listFiles(path.join(dir, e.name), base + e.name + '/')
    : [{ path: base + e.name, size: fs.statSync(path.join(dir, e.name)).size }]);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/state') return json(res, 200, { flight: state.flight, settings: state.settings, library: state.library, safety: state.safety, history: state.history, sim, info: { urls: ['http://192.168.1.20:' + PORT], version: 'dev' } });
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': ok\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/api/patch' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      body.ops.forEach(op => {
        if (body.doc === 'safety') {   // as on the host: a closed report is locked; reports are opened through /api/safety/open
          const r = state.safety.reports[op.path[1]];
          if (op.path[0] !== 'reports' || !r || r.status === 'closed' || (op.path.length === 2 && op.op !== 'del')) return;
        }
        applyOp(state[body.doc], op);
      });
      pushDoc(body.doc);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/flight/new' && req.method === 'POST') { state.flight = JSON.parse(await readBody(req)).flight; pushDoc('flight'); return json(res, 200, { ok: true }); }
    if (p === '/api/flight/undo-landing' && req.method === 'POST') {
      const f = state.flight;
      if (f.closed) return json(res, 400, { error: 'The flight is already closed.' });
      delete f.times.on; delete f.times.in; delete f.fuel.on; delete f.fuel.in; delete f.landing;
      const last = f.navlog[f.navlog.length - 1];
      if (last && last.type === 'apt' && last.auto) { delete last.ata; delete last.fob; delete last.alt; delete last.auto; }
      sim = { ...sim, stage: 2, onGround: false }; send({ t: 'sim', d: sim });
      notify('Landing removed', 'The flight continues; the next landing will be recorded.', 'good'); pushDoc('flight');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/safety/open' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req));
      state.safety.seq = (state.safety.seq || 0) + 1;
      const id = Math.random().toString(36).slice(2, 14);
      const r = { id, number: `SR-${new Date().getUTCFullYear()}-${String(state.safety.seq).padStart(4, '0')}`, type: b.type, typeName: b.typeName, title: '', status: 'open',
        openedAt: new Date().toISOString(), openedBy: b.openedBy || '', severity: '', flight: b.flight || {}, fields: b.fields || {}, labels: b.labels || {}, required: b.required || [], narrative: b.narrative || '' };
      state.safety.reports[id] = r; pushDoc('safety');
      return json(res, 200, r);
    }
    if (p === '/api/safety/close' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req));
      const r = state.safety.reports[b.id];
      if (!r) return json(res, 400, { error: 'Report not found.' });
      if (r.status === 'closed') return json(res, 400, { error: 'This report is already closed.' });
      const miss = [];
      if (!r.severity) miss.push('severity');
      if ((r.narrative || '').trim().length < 10) miss.push('what happened');
      for (const k of r.required) if (r.fields[k] === '' || r.fields[k] == null) miss.push(r.labels[k] || k);
      if (!b.name || !b.outcome) miss.push('name and outcome');
      if (miss.length) return json(res, 400, { error: 'Complete before closing: ' + miss.join(', ') + '.' });
      r.status = 'closed'; r.closed = { time: new Date().toISOString(), name: b.name, outcome: b.outcome, actions: b.actions || '', signature: b.signature || '' };
      const sending = state.settings.sendReports !== false;
      r.discord = sending ? 'sending' : 'off';
      state.posted = [...(state.posted || []), r.number];
      pushDoc('safety');
      if (sending) setTimeout(() => { r.discord = new Date().toISOString(); pushDoc('safety'); notify('Safety report posted', `${r.number} ${r.typeName} was sent to the NAVDECK Discord.`, 'good'); }, 400);
      return json(res, 200, { ok: true, sending });
    }
    if (p === '/api/flight/close' && req.method === 'POST') {
      const f = state.flight;
      if (!f.closed || !f.closed.signature) return json(res, 400, { error: 'The flight must be signed first.' });
      if ((f.goArounds || []).some(g => !g.reason)) return json(res, 400, { error: 'Enter the reason for every go-around first.' });
      const mine = Object.values(state.safety.reports).filter(r => r.flight && r.flight.id === f.id && r.status === 'closed').map(r => r.type);
      const need = [];
      if ((f.goArounds || []).length) need.push(['unstable', 'Unstable approach / go-around']);
      if (f.landing && f.landing.rate >= (state.settings.hardLandingFpm || 600)) need.push(['hardlanding', 'Hard landing / tailstrike']);
      if (f.fuel && f.fuel.on != null && f.fuel.on < (state.settings.minLandingFuelKg || 1500)) need.push(['fuel', 'Fuel event']);
      const missingSr = need.filter(([t]) => !mine.includes(t));
      if (missingSr.length) return json(res, 400, { error: 'Complete and close the required safety report first: ' + missingSr.map(x => x[1]).join('; ') + '.' });
      state.archive[f.id] = JSON.parse(JSON.stringify(f));
      state.history = [summary(f), ...state.history.filter(h => h.id !== f.id)];
      send({ t: 'history', d: state.history });
      return json(res, 200, { ok: true, sending: state.settings.sendReports !== false });
    }
    if (p.startsWith('/api/history/')) {
      const id = p.slice('/api/history/'.length);
      if (req.method === 'DELETE') { delete state.archive[id]; state.history = state.history.filter(h => h.id !== id); send({ t: 'history', d: state.history }); return json(res, 200, { ok: true }); }
      return state.archive[id] ? json(res, 200, state.archive[id]) : json(res, 404, { error: 'Flight not found' });
    }
    if (p === '/api/simbrief') return json(res, 200, sampleOfp());
    if (p === '/api/vatsim') return json(res, 200, sampleVatsim());
    if (p === '/api/gsx/probe') return json(res, 200, { ok: false });
    if (p === '/api/report.pdf') return json(res, 501, { error: 'PDF export needs the Windows app' });
    if (p === '/api/lib/list') return json(res, 200, listFiles(path.join(LIB, url.searchParams.get('kind'))));
    if (p === '/api/lib/file') {
      const full = safe(path.join(url.searchParams.get('kind'), url.searchParams.get('path')));
      if (!full) return json(res, 400, { error: 'Bad path' });
      if (req.method === 'PUT') { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, await readBody(req)); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { fs.rmSync(full, { force: true }); return json(res, 200, { ok: true }); }
    }
    if (p.startsWith('/dev/sim/')) { simStep(p.slice('/dev/sim/'.length)); return json(res, 200, { ok: true }); }
    const file = p.startsWith('/lib/') ? safe(p.slice(5)) : path.join(WEB, p === '/' ? 'index.html' : p);
    if (file && file.startsWith(p.startsWith('/lib/') ? LIB : WEB) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log('NAVDECK EFB mock host on http://localhost:' + PORT));
