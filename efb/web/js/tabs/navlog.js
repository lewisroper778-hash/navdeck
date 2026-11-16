// NavLog: planned and actual times and fuel at every fix, fuel checks and the diversion log.
import { S, h, fmtT, fmtW, fmtSignedW, fmtAlt, fmtDur, setF, setS, nowIso, addNotice, num, wUnit, now } from '../core.js';
import { editTime, editWeight, recordFuelCheck } from '../actions.js';
import { modal } from '../widgets.js';

// Planned time over each fix, and the estimate revised by how early or late the flight is running.
export function navTimes(f) {
  const off = f.times.off ? Date.parse(f.times.off) : null;
  let drift = 0;
  return f.navlog.map(x => {
    const plan = off != null && x.planT != null ? new Date(off + x.planT * 1000).toISOString() : null;
    if (x.ata && plan) drift = Date.parse(x.ata) - Date.parse(plan);
    const est = x.ata ? null : x.eto || (plan ? new Date(Date.parse(plan) + drift).toISOString() : null);
    if (!x.ata && x.eto && plan) drift = Date.parse(x.eto) - Date.parse(plan);
    return { plan, est };
  });
}

function fuelDiff(x) {
  if (x.fob == null || x.planFob == null) return h('span', { class: 'muted' }, '--');
  const d = x.fob - x.planFob;
  return h('span', { class: d >= 0 ? 'good' : 'bad', title: d >= 0 ? 'More fuel than planned' : 'Less fuel than planned' },
    (d >= 0 ? '▲ ' : '▼ ') + fmtSignedW(d));
}

function table() {
  const f = S.flight, times = navTimes(f), lock = !!f.closed;
  const hide = S.settings.hideTocTod;
  const nextIndex = f.navlog.findIndex(x => !x.ata);
  const rows = f.navlog.map((x, i) => {
    if (hide && (x.type === 'toc' || x.type === 'tod')) return null;
    const t = times[i];
    const planCell = t.plan ? fmtT(t.plan) : x.planT != null ? '+' + fmtDur(x.planT * 1000) : '--';
    const tap = (text, cls, fn) => (lock ? h('span', { class: 'mono' }, text) : h('button', { class: 'tap ' + cls, onclick: fn }, text));
    return h('tr', { class: (x.ata ? 'passed ' : '') + (i === nextIndex ? 'next ' : '') + (x.type === 'toc' || x.type === 'tod' ? 'virtual' : '') },
      h('td', null, h('b', null, x.ident), x.via ? h('small', { class: 'muted' }, '  ' + x.via) : null),
      h('td', { class: 'num' }, planCell),
      h('td', { class: 'num' }, x.ata ? '' : tap(t.est ? fmtT(t.est) : '--:--', x.eto ? 'set' : '', () => editTime(`ETO ${x.ident}`, ['navlog', i, 'eto'], x.eto || t.est, t.plan))),
      h('td', { class: 'num' }, tap(x.ata ? fmtT(x.ata) : '--:--', x.ata ? (x.auto ? 'auto' : 'set') : '', () => editTime(`ATA ${x.ident}`, ['navlog', i, 'ata'], x.ata, t.est || t.plan))),
      h('td', { class: 'num' }, fmtW(x.planFob, false)),
      h('td', { class: 'num' }, tap(x.fob != null ? fmtW(x.fob, false) : '--', x.fob != null ? (x.auto ? 'auto' : 'set') : '', () => editWeight(`FOB at ${x.ident}`, ['navlog', i, 'fob'], x.fob))),
      h('td', { class: 'num' }, fuelDiff(x)),
      h('td', { class: 'num muted' }, x.alt != null ? fmtAlt(x.alt) : x.planAlt != null ? fmtAlt(x.planAlt) : ''));
  });
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null,
      h('th', null, 'Fix'), h('th', { class: 'num' }, 'Plan'), h('th', { class: 'num' }, 'ETO'), h('th', { class: 'num' }, 'ATA'),
      h('th', { class: 'num' }, `Plan FOB ${wUnit()}`), h('th', { class: 'num' }, `FOB ${wUnit()}`), h('th', { class: 'num' }, 'vs plan'), h('th', { class: 'num' }, 'Altitude'))),
    h('tbody', null, rows)));
}

function summary() {
  const f = S.flight, times = navTimes(f);
  const last = [...f.navlog].reverse().find(x => x.ata && x.fob != null && x.planFob != null);
  const diff = last ? last.fob - last.planFob : null;
  const dest = times[times.length - 1];
  const lastIdx = f.navlog.length - 1;
  const eta = f.times.on || (dest && (dest.est || dest.plan));
  const landFob = diff != null && f.fuel.planLanding != null ? f.fuel.planLanding + diff : null;
  return h('div', { class: 'kv' },
    h('div', null, h('span', null, 'Fuel vs plan'), h('b', { class: 'mono ' + (diff == null ? '' : diff >= 0 ? 'good' : 'bad') }, diff == null ? '--' : fmtSignedW(diff) + ' ' + wUnit()),
      h('small', null, last ? (diff >= 0 ? 'Above plan at ' : 'Below plan at ') + last.ident : 'Shown after the first fix')),
    h('div', null, h('span', null, f.times.on ? 'Landed' : 'Estimated arrival'), h('b', { class: 'mono' }, eta ? fmtT(eta) + 'z' : '--:--'), h('small', null, lastIdx >= 0 ? f.navlog[lastIdx].ident : '')),
    h('div', null, h('span', null, 'Est. landing fuel'), h('b', { class: 'mono' }, fmtW(landFob ?? f.fuel.planLanding)), h('small', null, 'Plan ' + fmtW(f.fuel.planLanding))),
    h('div', { id: 'nav-live' }, h('span', null, 'Next fix'), h('b', null, '--')));
}

function fuelChecksCard() {
  const f = S.flight, st = S.settings;
  const due = f.times.off && !f.times.on ? new Date(Date.parse(f.lastFuelCheck || f.times.off) + st.fuelCheckMin * 60000) : null;
  const overdue = due && now() >= due;
  return h('div', { class: 'card c7' },
    h('h3', null, 'Fuel checks', h('span', { class: 'spacer' }),
      due && h('span', { class: 'tag ' + (overdue ? 'bad' : '') }, overdue ? 'Due now' : 'Next ' + fmtT(due.toISOString()) + 'z')),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('div', { class: 'seg' }, [30, 60].map(m => h('button', { class: st.fuelCheckMin === m ? 'on' : '', onclick: () => setS(['fuelCheckMin'], m) }, `Every ${m} min`))),
      h('button', { class: 'switch' + (st.fuelCheckOn ? ' on' : ''), 'aria-label': 'Fuel check reminders', onclick: () => setS(['fuelCheckOn'], !st.fuelCheckOn) }),
      h('span', { class: 'muted' }, 'Automatic checks and reminders'),
      h('div', { class: 'spacer' }),
      !f.closed && h('button', { class: 'btn small primary', onclick: recordFuelCheck }, 'Record fuel check now')),
    f.fuelChecks.length ? h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', { class: 'num' }, 'FOB'), h('th', { class: 'num' }, 'Plan'), h('th', { class: 'num' }, 'vs plan'), h('th', null, ''))),
      h('tbody', null, f.fuelChecks.map(c => {
        const d = c.plan != null ? c.fob - c.plan : null;
        return h('tr', null, h('td', { class: 'mono' }, fmtT(c.time) + 'z'), h('td', { class: 'num' }, fmtW(c.fob)), h('td', { class: 'num' }, fmtW(c.plan)),
          h('td', { class: 'num ' + (d == null ? '' : d >= 0 ? 'good' : 'bad') }, d == null ? '--' : fmtSignedW(d)),
          h('td', null, h('span', { class: 'tag' + (c.auto ? ' accent' : '') }, c.auto ? 'Automatic' : 'Manual')));
      })))
      : h('div', { class: 'empty' }, 'Fuel checks are recorded after take-off.'));
}

async function divert() {
  const f = S.flight;
  const to = h('input', { class: 'input', type: 'text', value: f.altn || '', autocapitalize: 'characters', placeholder: 'ICAO' });
  const reason = h('select', { class: 'input' }, ['Weather at destination', 'Fuel', 'Technical', 'Medical', 'Airport closed', 'ATC', 'Other'].map(r => h('option', null, r)));
  const remark = h('input', { class: 'input', type: 'text', placeholder: 'Remarks (optional)' });
  const ok = await modal({
    title: 'Divert to alternate',
    body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Diverting to'), to),
      h('label', { class: 'field' }, h('span', null, 'Reason'), reason), h('label', { class: 'field' }, h('span', null, 'Remarks'), remark)),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Log diversion', value: true, danger: true }],
  });
  if (!ok || !to.value.trim()) return;
  const s = S.sim;
  await setF(['diversion'], {
    time: nowIso(), to: to.value.trim().toUpperCase(), from: f.arr, reason: reason.value, remark: remark.value.trim(),
    fob: s.connected && s.fobKg > 0 ? s.fobKg : null, lat: s.hasPosition ? s.lat : null, lon: s.hasPosition ? s.lon : null, alt: s.hasPosition ? s.altFt : null,
  });
  addNotice({ title: 'Diversion logged', text: `Diverting to ${to.value.trim().toUpperCase()}: ${reason.value}`, kind: 'warn' });
}

function diversionCard() {
  const f = S.flight, d = f.diversion;
  return h('div', { class: 'card c5' },
    h('h3', null, 'Diversion log'),
    d ? h('div', { class: 'stack' },
      h('div', { class: 'kv' },
        h('div', null, h('span', null, 'Diverted to'), h('b', null, d.to), h('small', null, 'Planned ' + (d.from || '--'))),
        h('div', null, h('span', null, 'Decision'), h('b', { class: 'mono' }, fmtT(d.time) + 'z')),
        h('div', null, h('span', null, 'FOB'), h('b', { class: 'mono' }, fmtW(d.fob)))),
      h('div', null, h('span', { class: 'tag warn' }, d.reason), d.remark ? '  ' + d.remark : ''),
      d.lat != null && h('small', { class: 'muted mono' }, `Position ${num(d.lat, 3)}, ${num(d.lon, 3)} at ${fmtAlt(d.alt)}`),
      !f.closed && h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => setF(['diversion'], null) }, 'Cancel diversion')))
      : h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Alternate: ${f.altn || 'none planned'}. Logging a diversion records the time, position and fuel on board and adds it to the journey log.`),
        !f.closed && h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: divert }, 'Divert to alternate'))));
}

function liveNext(sim) {
  const el = document.getElementById('nav-live');
  if (!el) return;
  const next = S.flight.navlog.find(x => !x.ata);
  el.replaceChildren(h('span', null, 'Next fix'), h('b', null, next ? next.ident : 'Complete'),
    h('small', null, next && sim?.nextDistNm != null && sim.stage === 2 ? num(sim.nextDistNm) + ' nm to go' : ''));
}

export default {
  deps: ['flight', 'settings'],
  render(root) {
    const f = S.flight, st = S.settings;
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'NavLog'), h('div', { class: 'spacer' }),
      h('span', { class: 'muted' }, 'Hide TOC and TOD'),
      h('button', { class: 'switch' + (st.hideTocTod ? ' on' : ''), 'aria-label': 'Hide TOC and TOD', onclick: () => setS(['hideTocTod'], !st.hideTocTod) })));
    if (!f.navlog.length) {
      root.append(h('div', { class: 'grid' },
        h('div', { class: 'card c12 empty' }, 'No route loaded. Load a SimBrief plan on the Flight tab to get the NavLog. Times and fuel on board are filled in automatically as you pass each fix; tap any value to enter it with the keypad.'),
        fuelChecksCard(), diversionCard()));
      return;
    }
    root.append(h('div', { class: 'grid' },
      h('div', { class: 'card c12' }, h('h3', null, 'Progress', h('span', { class: 'spacer' }), h('span', { class: 'tag accent' }, 'Purple values are logged automatically. Tap a value to edit it.')), summary()),
      h('div', { class: 'card c12', style: { padding: '6px 6px 2px' } }, table()),
      fuelChecksCard(), diversionCard()));
    liveNext(S.sim);
  },
  live: liveNext,
};
