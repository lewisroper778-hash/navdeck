// Times: block and flight times, slots (TSAT and CTOT), the EFB clock and movement messages.
import { S, h, fmtT, fmtDur, diffMs, now, usingSimClock, setS, push, nowIso, addNotice } from '../core.js';
import { editTime } from '../actions.js';
import { navTimes } from './navlog.js';

const hm = iso => fmtT(iso).replace(':', '');
const day = iso => String(new Date(iso).getUTCDate()).padStart(2, '0');

export function movementText(f, kind) {
  const t = f.times;
  const head = `MVT\n${f.flightNo || f.callsign}/${day(t.out || t.off || nowIso())}.${(f.reg || '').replace(/-/g, '') || 'REG'}.${f.dep}`;
  const delays = f.occ.delays.length ? '\nDL' + f.occ.delays.map(d => d.code).join('/') + '/' + f.occ.delays.map(d => String(Math.floor(d.minutes / 60)).padStart(2, '0') + String(d.minutes % 60).padStart(2, '0')).join('/') : '';
  const pax = f.load?.final ? '\nPX' + f.load.final.pax : '';
  if (kind === 'dep') {
    const times = navTimes(f);
    const eta = times.length ? times[times.length - 1].est || times[times.length - 1].plan : t.sta;
    return `${head}\nAD${hm(t.out)}/${hm(t.off)} EA${eta ? hm(eta) : '----'} ${f.diversion?.to || f.arr}${delays}${pax}`;
  }
  if (kind === 'arr') return `MVT\n${f.flightNo || f.callsign}/${day(t.on)}.${(f.reg || '').replace(/-/g, '') || 'REG'}.${f.diversion?.to || f.arr}\nAA${hm(t.on)}/${hm(t.in)}`;
  return `DIV\n${f.flightNo || f.callsign}/${day(f.diversion.time)}.${(f.reg || '').replace(/-/g, '') || 'REG'}.${f.dep}\nEA---- ${f.diversion.to}\nSI DIVERTED FROM ${f.diversion.from} DUE ${f.diversion.reason.toUpperCase()}`;
}

function blockCard() {
  const f = S.flight, t = f.times, lock = !!f.closed;
  const cell = (label, key, hint) => h('div', null, h('span', null, label),
    lock ? h('b', { class: 'mono' }, fmtT(t[key])) : h('button', { class: 'tap ' + (t[key] ? 'set' : ''), onclick: () => editTime(label, ['times', key], t[key], t.std) }, fmtT(t[key])),
    h('small', null, hint));
  const depDelay = t.std && t.out ? diffMs(t.std, t.out) : null;
  const arrDelay = t.sta && t.in ? diffMs(t.sta, t.in) : null;
  const late = ms => (ms == null ? '' : ms > 60000 ? fmtDur(ms) + ' late' : ms < -60000 ? fmtDur(-ms) + ' early' : 'on time');
  return h('div', { class: 'card c12' },
    h('h3', null, 'Block and flight times', h('span', { class: 'spacer' }), h('span', { class: 'tag accent' }, 'Filled in automatically. Tap to correct.')),
    h('div', { class: 'kv' },
      cell('STD', 'std', 'Scheduled departure'), cell('Off blocks', 'out', late(depDelay)), cell('Take-off', 'off', ''),
      cell('Landing', 'on', ''), cell('On blocks', 'in', late(arrDelay)), cell('STA', 'sta', 'Scheduled arrival')),
    h('div', { class: 'kv', style: { marginTop: '14px' } },
      h('div', null, h('span', null, 'Block time'), h('b', { class: 'mono', id: 't-block' }, '--:--'), h('small', null, 'Plan ' + (t.planBlockMin != null ? fmtDur(t.planBlockMin * 60000) : '--'))),
      h('div', null, h('span', null, 'Flight time'), h('b', { class: 'mono', id: 't-air' }, '--:--'), h('small', null, 'Plan ' + (t.planAirMin != null ? fmtDur(t.planAirMin * 60000) : '--'))),
      h('div', null, h('span', null, 'Taxi out'), h('b', { class: 'mono' }, fmtDur(diffMs(t.out, t.off)))),
      h('div', null, h('span', null, 'Taxi in'), h('b', { class: 'mono' }, fmtDur(diffMs(t.on, t.in))))));
}

function slotCard() {
  const f = S.flight, t = f.times, lock = !!f.closed;
  const cell = (label, key, hint) => h('div', null, h('span', null, label),
    lock ? h('b', { class: 'mono' }, fmtT(t[key])) : h('button', { class: 'tap ' + (t[key] ? 'set' : ''), onclick: () => editTime(label, ['times', key], t[key], t.std) }, fmtT(t[key])),
    h('small', { id: 'slot-' + key }, hint));
  return h('div', { class: 'card c6' },
    h('h3', null, 'Slots'),
    h('div', { class: 'kv' }, cell('TSAT', 'tsat', 'Target start-up approval'), cell('CTOT', 'ctot', 'Calculated take-off time')),
    h('p', { class: 'muted', style: { marginTop: '12px' } }, 'The CTOT window is 5 minutes before to 10 minutes after the slot. Enter the times with the keypad.'));
}

function clockCard() {
  const st = S.settings;
  return h('div', { class: 'card c6' },
    h('h3', null, 'EFB clock'),
    h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('div', { class: 'big mono', id: 't-clock' }, '--:--:--'), h('span', { class: 'tag ' + (usingSimClock() ? 'warn' : 'good') }, usingSimClock() ? 'Simulator time' : 'Real time (UTC)')),
      h('div', { class: 'seg' }, [['auto', 'Automatic'], ['real', 'Real time'], ['sim', 'Simulator time']].map(([v, label]) =>
        h('button', { class: st.clock === v ? 'on' : '', onclick: () => setS(['clock'], v) }, label))),
      h('p', { class: 'muted' }, 'Automatic follows the simulator clock whenever it differs from real time by more than two minutes, so logged times match the flight you see.')));
}

function movementCard() {
  const f = S.flight, t = f.times;
  const send = async kind => {
    const text = movementText(f, kind);
    await push('flight', ['movement'], { kind, text, time: nowIso() });
    addNotice({ title: 'Movement message sent', text: text.split('\n').slice(1).join('  '), kind: 'good' });
  };
  const sent = kind => f.movement.some(m => m.kind === kind);
  return h('div', { class: 'card c12' },
    h('h3', null, 'Movement messages'),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('button', { class: 'btn', disabled: !t.off || sent('dep') || !!f.closed, onclick: () => send('dep') }, sent('dep') ? 'Departure message sent' : 'Send departure message'),
      h('button', { class: 'btn', disabled: !t.in || sent('arr') || !!f.closed, onclick: () => send('arr') }, sent('arr') ? 'Arrival message sent' : 'Send arrival message'),
      f.diversion && h('button', { class: 'btn', disabled: sent('div') || !!f.closed, onclick: () => send('div') }, sent('div') ? 'Diversion message sent' : 'Send diversion message')),
    f.movement.length ? h('div', { class: 'grid' }, f.movement.map(m => h('div', { class: 'c4' }, h('div', { class: 'sheet' }, m.text), h('small', { class: 'muted' }, 'Sent ' + fmtT(m.time) + 'z'))))
      : h('div', { class: 'empty' }, 'The departure message is available after take-off and the arrival message once on blocks.'));
}

function tick() {
  const f = S.flight, t = f.times, cur = now().toISOString();
  const put = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; if (cls != null) el.className = cls; } };
  put('t-clock', fmtT(cur, true) + 'z');
  put('t-block', fmtDur(t.out ? diffMs(t.out, t.in || cur) : null));
  put('t-air', fmtDur(t.off ? diffMs(t.off, t.on || cur) : null));
  for (const key of ['tsat', 'ctot']) {
    if (!t[key] || t.off) continue;
    const ms = diffMs(cur, t[key]);
    const text = ms >= 0 ? 'in ' + fmtDur(ms) : fmtDur(-ms) + ' ago';
    const cls = key === 'ctot' ? (ms < -600000 ? 'bad' : ms < 300000 ? 'warn' : '') : (ms < 0 ? 'warn' : '');
    put('slot-' + key, text, cls);
  }
}

export default {
  deps: ['flight', 'settings'],
  render(root) {
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'Times')),
      h('div', { class: 'grid' }, blockCard(), slotCard(), clockCard(), movementCard()));
    tick();
  },
  tick,
};
