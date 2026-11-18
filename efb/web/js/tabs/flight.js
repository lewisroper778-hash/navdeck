// Flight overview: route, phase, automatic times and fuel, crew, safety reports and the logbook.
import { S, h, fmtT, fmtW, fmtDur, fmtDate, diffMs, push, del, api, nowIso, flightTitle, now } from '../core.js';
import { newFromSimbrief, newBlank, signAndClose, exportPdf } from '../actions.js';
import { modal, confirmBox, toast, rateRating, rateClass } from '../widgets.js';
import { CREW_ROLES } from '../data.js';
import { safetyType, requiredReports } from '../safety-types.js';
import { openReport, continueReport } from './safety.js';

const PHASES = ['Parked', 'Taxi out', 'Airborne', 'Taxi in', 'Arrived'];

function phaseBar() {
  const f = S.flight;
  let stage = S.sim.connected ? (S.sim.stage ?? 0) : f.times.in ? 4 : f.times.on ? 3 : f.times.off ? 2 : f.times.out ? 1 : 0;
  if (f.times.in) stage = 4;
  return h('div', { class: 'phase', id: 'phase-bar' }, PHASES.map((p, i) => h('div', { class: (i <= stage ? 'done ' : '') + (i === stage ? 'now' : '') }, p)));
}

function startCard() {
  return h('div', { class: 'card c12' },
    h('h3', null, 'Start a flight'),
    h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Load your latest SimBrief plan and NAVDECK EFB fills the NavLog, fuel plan, loads and times. Once the simulator is connected, block times, waypoint times and fuel on board are recorded automatically.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: newFromSimbrief }, 'Load SimBrief plan'),
        h('button', { class: 'btn', onclick: newBlank }, 'New flight without SimBrief'))));
}

function eventsCard() {
  const f = S.flight, t = f.times, fu = f.fuel;
  const cell = (label, time, fuel) => h('div', null, h('span', null, label), h('b', { class: 'mono' }, fmtT(time) + (time ? 'z' : '')), h('small', null, 'FOB ' + fmtW(fuel)));
  const block = t.out ? diffMs(t.out, t.in || now().toISOString()) : null;
  const air = t.off ? diffMs(t.off, t.on || now().toISOString()) : null;
  const burn = fu.out != null ? fu.out - (fu.in ?? (S.sim.connected && S.sim.fobKg > 0 ? S.sim.fobKg : fu.out)) : null;
  return h('div', { class: 'card c7' },
    h('h3', null, 'Times and fuel', h('span', { class: 'spacer' }), h('span', { class: 'tag accent' }, 'Automatic from the simulator')),
    h('div', { class: 'kv' }, cell('Off blocks', t.out, fu.out), cell('Take-off', t.off, fu.off), cell('Landing', t.on, fu.on), cell('On blocks', t.in, fu.in)),
    h('div', { class: 'kv', style: { marginTop: '14px' } },
      h('div', null, h('span', null, 'Block time'), h('b', { class: 'mono' }, fmtDur(block)), h('small', null, 'Plan ' + (t.planBlockMin != null ? fmtDur(t.planBlockMin * 60000) : '--'))),
      h('div', null, h('span', null, 'Flight time'), h('b', { class: 'mono' }, fmtDur(air)), h('small', null, 'Plan ' + (t.planAirMin != null ? fmtDur(t.planAirMin * 60000) : '--'))),
      h('div', null, h('span', null, 'Fuel burned'), h('b', { class: 'mono' }, burn != null && burn >= 0 ? fmtW(burn) : '--'), h('small', null, 'Plan trip ' + fmtW(fu.planTrip))),
      h('div', null, h('span', null, 'Landing rate'), h('b', { class: 'mono ' + rateClass(f.landing?.rate) }, f.landing?.rate != null ? f.landing.rate + ' fpm' : '--'), h('small', null, rateRating(f.landing?.rate) || 'At touchdown'))));
}

function nextCard() {
  const f = S.flight;
  const next = f.navlog.find(x => !x.ata);
  const passed = f.navlog.filter(x => x.ata).length;
  const last = [...f.navlog].reverse().find(x => x.ata && x.fob != null && x.planFob != null);
  const diff = last ? last.fob - last.planFob : null;
  return h('div', { class: 'card c5' },
    h('h3', null, 'NavLog progress'),
    f.navlog.length ? h('div', { class: 'stack' },
      h('div', { class: 'kv' },
        h('div', null, h('span', null, 'Next fix'), h('b', null, next ? next.ident : 'Complete'), h('small', null, next ? (next.via || 'DCT') : `${passed} fixes logged`)),
        h('div', null, h('span', null, 'Passed'), h('b', { class: 'mono' }, `${passed} / ${f.navlog.length}`)),
        h('div', null, h('span', null, 'Fuel vs plan'), h('b', { class: 'mono ' + (diff == null ? '' : diff >= 0 ? 'good' : 'bad') },
          diff == null ? '--' : (diff >= 0 ? '+' : '−') + fmtW(Math.abs(diff))), h('small', null, last ? 'at ' + last.ident : 'after the first fix'))),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#navlog' }, 'Open NavLog'), f.goArounds.length > 0 && h('span', { class: 'tag warn' }, f.goArounds.length + ' go-around' + (f.goArounds.length > 1 ? 's' : ''))))
      : h('div', { class: 'empty' }, 'No route loaded. Load a SimBrief plan to log fixes by name.'));
}

function crewCard() {
  const f = S.flight;
  const add = async () => {
    const role = h('select', { class: 'input' }, CREW_ROLES.map(r => h('option', null, r)));
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Name' });
    const ok = await modal({ title: 'Add crew member', body: h('div', { class: 'stack' }, role, name), buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, primary: true }] });
    if (ok && name.value.trim()) push('flight', ['crew'], { role: role.value, name: name.value.trim() });
  };
  return h('div', { class: 'card c6' },
    h('h3', null, 'Crew', h('span', { class: 'spacer' }), !f.closed && h('button', { class: 'btn small', onclick: add }, 'Add')),
    f.crew.length ? h('table', { class: 'tbl' }, h('tbody', null, f.crew.map((c, i) => h('tr', null,
      h('td', { style: { width: '110px' } }, h('span', { class: 'tag' }, c.role)), h('td', null, c.name),
      h('td', { style: { width: '44px' } }, !f.closed && h('button', { class: 'btn small', 'aria-label': 'Remove', onclick: () => del('flight', ['crew', i]) }, '✕'))))))
      : h('div', { class: 'empty' }, 'No crew entered.'));
}

// Safety reports linked to this flight. They are filed, completed and closed in the Safety section.
function safetyCard() {
  const f = S.flight;
  const mine = Object.values(S.safety?.reports || {}).filter(r => r.flight?.id === f.id);
  const tips = requiredReports(f, S.safety?.reports, S.settings).filter(t => !t.done);
  return h('div', { class: 'card c6' },
    h('h3', null, 'Safety reports', h('span', { class: 'spacer' }), h('a', { class: 'btn small', href: '#safety' }, 'Open Safety')),
    tips.map(t => h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'tag bad' }, 'Required'), h('span', { style: { flex: '1' } }, `${safetyType(t.type).name}: ${t.why}`),
      t.report ? h('button', { class: 'btn small primary', onclick: () => continueReport(t.report.id) }, 'Continue')
        : h('button', { class: 'btn small primary', onclick: () => openReport(t.type) }, 'Open'))),
    mine.length ? h('div', { class: 'stack' }, mine.map(r => h('a', { class: 'msg', href: '#safety', style: { textDecoration: 'none', color: 'inherit' } },
      h('div', { class: 'body' }, h('div', { class: 'meta' }, `${r.number}  ·  ${r.status === 'closed' ? 'Closed' : 'Open'}${r.severity ? '  ·  ' + r.severity : ''}`), r.typeName + (r.title ? ': ' + r.title : '')))))
      : !tips.length && h('div', { class: 'empty' }, 'No safety reports for this flight.'));
}

function historyCard() {
  const open = async item => { window.open('report.html?id=' + encodeURIComponent(item.id), '_blank'); };
  const remove = async item => {
    if (!(await confirmBox('Delete flight?', `${item.flightNo || ''} ${item.dep} to ${item.arr} on ${fmtDate(item.date)} will be removed from the logbook.`, 'Delete', true))) return;
    await api('/api/history/' + encodeURIComponent(item.id), { method: 'DELETE' });
  };
  return h('div', { class: 'card c12' },
    h('h3', null, 'Logbook'),
    S.history.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Date', 'Flight', 'From', 'To', 'Aircraft', 'Block', 'Landing', 'Fuel burned', ''].map(x => h('th', null, x)))),
      h('tbody', null, S.history.map(item => h('tr', null,
        h('td', null, fmtDate(item.date)), h('td', null, item.flightNo || '-'), h('td', null, item.dep), h('td', null, item.arr), h('td', null, item.type || ''),
        h('td', { class: 'mono' }, fmtDur(item.blockMs)), h('td', { class: 'mono ' + rateClass(item.rate) }, item.rate != null ? item.rate + ' fpm' : '-'),
        h('td', { class: 'mono' }, fmtW(item.burnKg)),
        h('td', null, h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
          h('button', { class: 'btn small', onclick: () => open(item) }, 'Report'),
          h('button', { class: 'btn small', onclick: () => exportPdf(item.id) }, 'PDF'),
          h('button', { class: 'btn small danger', 'aria-label': 'Delete', onclick: () => remove(item) }, '✕'))))))))
      : h('div', { class: 'empty' }, 'Closed flights appear here.'));
}

export default {
  deps: ['flight', 'settings', 'history', 'safety'],
  render(root) {
    const f = S.flight;
    if (!f.dep) {
      root.append(h('div', { class: 'page-head' }, h('h2', null, 'Flight')), h('div', { class: 'grid' }, startCard(), historyCard()));
      return;
    }
    const needReason = f.goArounds.some(g => !g.reason);
    root.append(
      h('div', { class: 'page-head' }, h('h2', null, 'Flight'), h('div', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: newFromSimbrief }, 'Load SimBrief plan'),
        h('button', { class: 'btn', onclick: newBlank }, 'New flight'),
        f.closed ? h('button', { class: 'btn primary', onclick: () => exportPdf(f.id) }, 'Export PDF')
          : h('button', { class: 'btn primary', onclick: signAndClose }, 'Sign and close flight')),
      f.closed && h('div', { class: 'banner b-good' }, h('div', null, h('b', null, 'Flight closed. '), `Signed by ${f.closed.name} at ${fmtT(f.closed.time)}z.`), h('div', { class: 'spacer' }), h('a', { class: 'btn small', href: '#report' }, 'Open report')),
      !f.closed && needReason && h('div', { class: 'banner' }, h('div', null, h('b', null, (() => { const open = f.goArounds.filter(g => !g.reason); const tg = open.some(g => g.kind === 'touch-and-go'), ga = open.some(g => g.kind !== 'touch-and-go'); return (ga && tg ? 'Go-around and touch-and-go detected. ' : tg ? 'Touch-and-go detected. ' : 'Go-around detected. '); })()), 'The reason must be entered before the flight can be signed and closed.'), h('div', { class: 'spacer' }), h('button', { class: 'btn small', onclick: signAndClose }, 'Enter reason')),
      f.diversion && h('div', { class: 'banner b-bad' }, h('div', null, h('b', null, `Diverted to ${f.diversion.to}. `), `${fmtT(f.diversion.time)}z  ${f.diversion.reason || ''}`)),
      h('div', { class: 'grid' },
        h('div', { class: 'card c12' },
          h('div', { class: 'row' },
            h('div', null, h('div', { class: 'big' }, flightTitle(f)), h('div', { class: 'muted' }, [f.depName, f.arrName].filter(Boolean).join('  →  ') || 'Airports are detected from the aircraft position')),
            h('div', { class: 'spacer' }),
            h('div', { class: 'kv', style: { minWidth: 'min(480px, 100%)' } },
              h('div', null, h('span', null, 'Flight'), h('b', null, f.flightNo || f.callsign || '--')),
              h('div', null, h('span', null, 'Aircraft'), h('b', null, [f.type, f.reg].filter(Boolean).join(' ') || '--')),
              h('div', null, h('span', null, 'Alternate'), h('b', null, f.altn || '--')),
              h('div', null, h('span', null, 'Cruise'), h('b', null, f.cruiseFl || '--')))),
          phaseBar(),
          f.route && h('div', { class: 'muted mono', style: { marginTop: '10px', fontSize: '12px', wordBreak: 'break-word' } }, f.route)),
        eventsCard(), nextCard(), crewCard(), safetyCard(), historyCard()));
  },
  live() {
    const bar = document.getElementById('phase-bar');
    if (bar) bar.replaceWith(phaseBar());
  },
};
