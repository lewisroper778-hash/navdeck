// Journey log: one printable page set used for the on-screen report and the PDF export.
import { S, h, api, loadState, useFlight, fmtT, fmtDate, fmtDur, fmtW, fmtSignedW, fmtVol, fmtAlt, diffMs, num, wUnit } from './core.js';
import { drawTouchdown, lateralText, rateRating } from './widgets.js';
import { navTimes } from './tabs/navlog.js';
import { loadSheetText, loadFigures } from './tabs/loads.js';
import { SPECIAL_CODES } from './data.js';

const q = new URLSearchParams(location.search);
const section = (title, ...kids) => h('div', { class: 'section' }, h('h2', null, title), ...kids);
const tbl = (heads, rows) => h('table', null, h('thead', null, h('tr', null, heads.map(x => h('th', { class: x.startsWith('#') ? 'num' : '' }, x.replace(/^#/, ''))))), h('tbody', null, rows));
const td = (v, cls) => h('td', { class: cls || '' }, v);

function build() {
  const f = S.flight, t = f.times, fu = f.fuel, st = S.settings;
  const profile = (st.profiles || []).find(p => p.id === f.profile) || (st.profiles || []).find(p => p.icao && p.icao.toUpperCase() === (f.airline || '').toUpperCase());
  const burn = fu.out != null && fu.in != null ? fu.out - fu.in : null;
  const page = document.getElementById('page');
  const parts = [];

  parts.push(h('div', { class: 'band' }, profile?.logo ? h('img', { class: 'airline', src: profile.logo, alt: '' }) : h('img', { src: 'img/logo.svg', alt: '' }),
    h('h1', null, profile?.name || st.company || 'NAVDECK'), h('div', { class: 'right' }, 'JOURNEY LOG', h('br'), fmtDate(t.out || t.off || f.created))));

  const body = h('div', { class: 'body' });
  body.append(
    h('div', { class: 'route' }, f.dep || '----', h('span', null, '→'), f.diversion ? f.diversion.to : (f.arr || '----')),
    h('div', { class: 'sub' }, [f.flightNo || f.callsign, [f.type, f.reg].filter(Boolean).join(' '), f.depName && f.arrName ? `${f.depName} to ${f.arrName}` : '', f.closed ? '' : 'DRAFT, NOT SIGNED'].filter(Boolean).join('   |   ')),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('span', null, 'Block time'), h('b', null, fmtDur(diffMs(t.out, t.in))), h('small', null, 'Plan ' + (t.planBlockMin != null ? fmtDur(t.planBlockMin * 60000) : '--'))),
      h('div', { class: 'tile' }, h('span', null, 'Flight time'), h('b', null, fmtDur(diffMs(t.off, t.on))), h('small', null, 'Plan ' + (t.planAirMin != null ? fmtDur(t.planAirMin * 60000) : '--'))),
      h('div', { class: 'tile' }, h('span', null, 'Fuel burned'), h('b', null, fmtW(burn)), h('small', null, 'Plan trip ' + fmtW(fu.planTrip))),
      h('div', { class: 'tile' }, h('span', null, 'Landing rate'), h('b', null, f.landing?.rate != null ? num(f.landing.rate) + ' fpm' : '--'), h('small', null, rateRating(f.landing?.rate) || ''))));

  // times and fuel
  const ev = [['Off blocks', t.out, fu.out], ['Take-off', t.off, fu.off], ['Landing', t.on, fu.on], ['On blocks', t.in, fu.in]];
  body.append(h('div', { class: 'cols' },
    section('Times and fuel', tbl(['Event', 'Time (UTC)', '#FOB', '#Used'], ev.map(([n, time, fob], i) => h('tr', null, td(n), td(fmtT(time, true) + (time ? 'z' : '')), td(fmtW(fob), 'num'), td(i && fu.out != null && fob != null ? fmtW(fu.out - fob) : '', 'num muted'))))),
    section('Plan and slots', tbl(['Item', '#Value'], [
      ['STD / STA', `${fmtT(t.std)} / ${fmtT(t.sta)}`], ['TSAT / CTOT', `${fmtT(t.tsat)} / ${fmtT(t.ctot)}`],
      ['Planned block fuel', fmtW(fu.planRamp)], ['Planned landing fuel', fmtW(fu.planLanding)],
      ['Fuel uplift', fu.uplift != null ? `${fmtW(fu.uplift)} (${fmtVol(fu.uplift)})` : '--'], ['Alternate', f.altn || '--'],
    ].map(([a, b]) => h('tr', null, td(a), td(b, 'num')))))));

  if (f.occ.delays.length) body.append(section('Delays', tbl(['Code', 'Reason', '#Minutes', 'Remark'], f.occ.delays.map(d => h('tr', null, td(d.code + (d.alpha ? ' ' + d.alpha : '')), td(d.text), td(d.minutes, 'num'), td(d.remark || ''))))));
  if (f.diversion) body.append(section('Diversion', h('p', null, `Diverted from ${f.diversion.from || '--'} to ${f.diversion.to} at ${fmtT(f.diversion.time)}z. Reason: ${f.diversion.reason}${f.diversion.remark ? ' (' + f.diversion.remark + ')' : ''}. Fuel on board ${fmtW(f.diversion.fob)}.`)));

  // navlog
  if (f.navlog.length) {
    const times = navTimes(f);
    const rows = f.navlog.map((x, i) => {
      if (st.hideTocTod && (x.type === 'toc' || x.type === 'tod')) return null;
      const d = x.fob != null && x.planFob != null ? x.fob - x.planFob : null;
      return h('tr', null, td(x.ident + (x.via ? '  ' + x.via : '')), td(times[i].plan ? fmtT(times[i].plan) : '--', 'num'), td(x.ata ? fmtT(x.ata) : '--', 'num'),
        td(fmtW(x.planFob, false), 'num'), td(fmtW(x.fob, false), 'num'),
        td(d == null ? '' : fmtSignedW(d), 'num ' + (d == null ? '' : d >= 0 ? 'good' : 'bad')), td(x.alt != null ? fmtAlt(x.alt) : '', 'num muted'));
    });
    body.append(h('div', null, h('h2', null, `NavLog (fuel in ${wUnit()})`), tbl(['Fix', '#Plan', '#ATA', '#Plan FOB', '#FOB', '#vs plan', '#Altitude'], rows)));
  }
  if (f.fuelChecks.length) body.append(section('Fuel checks', tbl(['Time', '#FOB', '#Plan', '#vs plan', 'Type'], f.fuelChecks.map(c => {
    const d = c.plan != null ? c.fob - c.plan : null;
    return h('tr', null, td(fmtT(c.time) + 'z'), td(fmtW(c.fob), 'num'), td(fmtW(c.plan), 'num'), td(d == null ? '' : fmtSignedW(d), 'num ' + (d == null ? '' : d >= 0 ? 'good' : 'bad')), td(c.auto ? 'Automatic' : 'Manual'));
  }))));

  // landing
  const l = f.landing;
  const plot = h('canvas', { class: 'plot' });
  body.append(section('Landing and touchdown',
    h('p', null, l ? `Landing rate ${num(l.rate)} fpm (${rateRating(l.rate)}). ` + (l.runway ? `Runway ${l.runway} at ${l.airport}, ${fmtAlt(l.distFt)} from the threshold, ${lateralText(l.offsetFt)}. Ground speed ${num(l.gsKt)} kt.` : 'Runway not identified.') : 'No landing recorded.'),
    l && plot));
  if (f.goArounds.length) body.append(section('Go-arounds and touch-and-goes', tbl(['Time', 'Event', 'Reason', 'Remarks'], f.goArounds.map(g => h('tr', null, td(fmtT(g.time) + 'z'), td(g.kind === 'touch-and-go' ? 'Touch-and-go' : g.raFt != null ? fmtAlt(Math.round(g.raFt)) + ' AGL' : '--'), td(g.reason || h('span', { class: 'draft' }, 'REASON NOT ENTERED')), td(g.remark || ''))))));

  // loads
  if (f.load) {
    const g = loadFigures(f), ld = f.load;
    const sigs = [['Load sheet', ld.sheetSig], ['LID', ld.lidSig]].filter(x => x[1]);
    body.append(section('Load sheet and LID', h('div', { class: 'cols' }, h('pre', null, loadSheetText(f)),
      h('div', null,
        tbl(['Special handling', '#Count'], Object.entries(ld.specials.reduce((a, x) => { a[x.code] = (a[x.code] || 0) + 1; return a; }, {})).map(([c, k]) => h('tr', null, td(`${c}  ${SPECIAL_CODES.find(s => s.code === c)?.text || ''}`), td(k, 'num')))),
        ld.holds && h('p', { class: 'muted' }, 'Holds: ' + ld.holds.map(x => `${x.name} ${fmtW(x.kg)}`).join(', ') + `. Traffic load ${fmtW(g.payload)}.`),
        sigs.map(([name, s]) => h('div', { class: 'sig' }, h('img', { src: s.image, alt: '' }), h('small', null, `${name}: ${s.name}, ${fmtT(s.time)}z`)))))));
  }

  // crew, safety, movement
  const crewAndSafety = [];
  if (f.crew.length) crewAndSafety.push(section('Crew', tbl(['Role', 'Name'], f.crew.map(c => h('tr', null, td(c.role), td(c.name))))));
  if (f.safety.length) crewAndSafety.push(section('Safety reports', tbl(['Time', 'Category', 'Report'], f.safety.map(r => h('tr', null, td(fmtT(r.time) + 'z'), td(r.category), td(r.text))))));
  if (crewAndSafety.length) body.append(crewAndSafety.length === 2 ? h('div', { class: 'cols' }, crewAndSafety) : crewAndSafety[0]);
  if (f.movement.length) body.append(section('Movement messages', h('div', { class: 'cols' }, f.movement.map(m => h('pre', null, m.text)))));

  // signature
  body.append(section('Pilot in command', f.closed
    ? h('div', { class: 'sig' }, h('img', { src: f.closed.signature, alt: '' }), h('small', null, `${f.closed.name}, signed and closed ${fmtDate(f.closed.time)} ${fmtT(f.closed.time)}z`))
    : h('p', { class: 'draft' }, 'This journey log has not been signed and closed yet.')));

  // GSX receipts close the log
  const rc = f.gsx.receipts || [];
  if (rc.length) {
    const total = rc.reduce((a, r) => a + (r.amount || 0), 0);
    body.append(section('GSX receipts and invoices', tbl(['Time', 'Service', 'Details', '#Amount'], [
      ...rc.map(r => h('tr', null, td(fmtT(r.time) + 'z'), td(r.type), td(r.text), td(`${num(r.amount, 2)} ${r.currency || ''}`, 'num'))),
      h('tr', null, td(''), td(''), td(h('b', null, 'Total')), td(h('b', null, `${num(total, 2)} ${st.currency}`), 'num')),
    ])));
  }

  parts.push(body, h('div', { class: 'foot' }, h('span', null, `Generated by NAVDECK EFB   |   ${f.flightNo || f.callsign || ''} ${f.dep}-${f.arr}   |   Times and fuel recorded from the simulator`), h('span', null, fmtDate(new Date().toISOString()))));
  page.replaceChildren(...parts);
  if (l) drawTouchdown(plot, l, { light: true, ratio: 2 });
}

async function start() {
  if (q.get('embed')) document.body.classList.add('embed');
  try {
    await loadState();
    const id = q.get('id');
    if (id && id !== 'current' && id !== S.flight.id) useFlight(await api('/api/history/' + encodeURIComponent(id)));
    build();
  } catch (e) {
    document.getElementById('page').append(h('p', { style: { padding: '20mm' } }, 'The journey log could not be loaded: ' + e.message));
  }
  document.title = `NAVDECK ${S.flight.flightNo || S.flight.callsign || ''} ${S.flight.dep}-${S.flight.arr}`.trim();
  window.reportReady = true;
  try { window.chrome?.webview?.postMessage('report-ready'); } catch { /* not in the Windows app */ }
  if (q.get('print')) setTimeout(() => window.print(), 400);
}
start();
