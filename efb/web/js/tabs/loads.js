// Loads: bookings, special handling, realistic final figures, load sheet and LID with signatures.
import { S, h, fmtT, fmtW, toW, wUnit, num, setF, push, del, nowIso, rnd, clamp, addNotice, fmtDate } from '../core.js';
import { modal, signaturePad, confirmBox, keypad } from '../widgets.js';
import { SPECIAL_CODES } from '../data.js';

const NAMES = ['MR J SMITH', 'MRS A KHAN', 'MS L MARTIN', 'MR D NOVAK', 'MRS E ROSSI', 'MSTR T BROWN', 'MISS S LEE', 'MR P DUBOIS', 'MS K ANDERSEN', 'MR R SILVA', 'MRS M WEBER', 'MR H TANAKA'];
const seat = seats => { const rows = Math.max(1, Math.ceil(seats / 6)); return rnd(1, rows) + 'ABCDEF'[rnd(0, 5)]; };

function makeSpecials(pax, seats) {
  const list = [];
  const target = clamp(Math.round(pax / 28) + rnd(0, 2), 0, 12);
  const pool = SPECIAL_CODES.flatMap(c => Array(c.weight).fill(c));
  for (let i = 0; i < target; i++) {
    const c = pool[rnd(0, pool.length - 1)];
    list.push({ code: c.code, name: NAMES[rnd(0, NAMES.length - 1)], seat: seat(seats), note: '' });
  }
  return list;
}

async function generateBooking() {
  const f = S.flight, p = f.plan || {};
  const seats = p.seats || 180;
  const booked = clamp(p.pax || Math.round(seats * (0.72 + Math.random() * 0.26)), 0, seats);
  await setF(['load'], {
    seats, booked, cargo: p.cargo || 0, bagsBooked: p.bags ?? Math.round(booked * 0.85),
    paxWeight: p.paxWeight || 84, bagWeight: p.bagWeight || 15,
    specials: makeSpecials(booked, seats), final: null, edition: 0, holds: null, sheetSig: null, lidSig: null, time: nowIso(),
  });
}

// Boarding closes: a few no-shows, a few late or standby passengers, never more than the seats.
async function finalise() {
  const f = S.flight, l = f.load;
  if (l.sheetSig && !(await confirmBox('Issue a new edition?', 'The load sheet is already signed. A new edition removes the signatures.', 'New edition'))) return;
  const noShows = Math.min(l.booked, Math.round(l.booked * Math.random() * 0.04) + (Math.random() < 0.3 ? 1 : 0));
  const free = l.seats - (l.booked - noShows);
  const late = clamp(Math.random() < 0.55 ? rnd(0, 4) : 0, 0, Math.max(0, free));
  const pax = clamp(l.booked - noShows + late, 0, l.seats);
  const jump = pax >= l.seats ? rnd(0, 5) : 0;         // company staff on jumpseats only when the cabin is full
  const bags = Math.max(0, Math.round((l.bagsBooked ?? pax) * (pax / Math.max(1, l.booked))) + rnd(-3, 3));
  const holdKg = bags * l.bagWeight + l.cargo;
  const shares = [0.24, 0.34, 0.27, 0.15];
  const holds = shares.map((s, i) => ({ name: 'Hold ' + (i + 1), kg: Math.round(holdKg * s) }));
  holds[1].kg += Math.round(holdKg - holds.reduce((a, x) => a + x.kg, 0));
  const edition = (l.edition || 0) + 1;
  await setF(['load'], { ...l, final: { pax, noShows, late, jump, bags, time: nowIso() }, holds, edition, sheetSig: null, lidSig: null });
  addNotice({ title: 'Final load sheet', text: `Edition ${edition}: ${pax} passengers (${noShows} no-show, ${late} late)` + (jump ? `, ${jump} staff on jumpseats` : ''), kind: 'info' });
}

export function loadFigures(f) {
  const l = f.load;
  if (!l) return null;
  const pax = l.final ? l.final.pax : l.booked;
  const jump = l.final?.jump || 0;
  const bags = l.final ? l.final.bags : (l.bagsBooked ?? pax);
  const paxKg = (pax + jump) * l.paxWeight, bagKg = bags * l.bagWeight, holdKg = bagKg + l.cargo;
  const payload = paxKg + holdKg;
  const p = f.plan || {};
  const oew = p.oew ?? null;
  const zfw = oew != null ? oew + payload : null;
  const tof = f.fuel.off ?? f.fuel.planTakeoff;
  const tow = zfw != null && tof != null ? zfw + tof : null;
  const trip = f.fuel.planTrip;
  const ldw = tow != null && trip != null ? tow - trip : null;
  return { pax, jump, bags, paxKg, bagKg, holdKg, payload, oew, zfw, tow, ldw, tof, trip, maxZfw: p.maxZfw, maxTow: p.maxTow, maxLdw: p.maxLdw };
}

export function loadSheetText(f) {
  const l = f.load, g = loadFigures(f);
  if (!l || !g) return '';
  const u = wUnit().toUpperCase();
  const w = kg => (kg == null ? '-----' : String(Math.round(toW(kg)))).padStart(7);
  const line = (label, kg, max) => `${label.padEnd(24)}${w(kg)}${max != null ? '   MAX ' + w(max) + (kg != null && kg > max ? '  ** EXCEEDED **' : '') : ''}`;
  const d = new Date(l.final?.time || l.time);
  const count = {};
  l.specials.forEach(x => { count[x.code] = (count[x.code] || 0) + 1; });
  return [
    `L O A D S H E E T          ${l.final ? 'FINAL' : 'PRELIMINARY'}          EDNO ${String(l.edition || 0).padStart(2, '0')}`,
    `ALL WEIGHTS IN ${u}`,
    '',
    `FROM/TO  FLIGHT     A/C REG   VERSION   DATE       TIME`,
    `${(f.dep + ' ' + f.arr).padEnd(9)}${(f.flightNo || f.callsign || '').padEnd(11)}${(f.reg || '-').padEnd(10)}${('Y' + l.seats).padEnd(10)}${fmtDate(d.toISOString()).replace(/ /g, '').padEnd(11)}${fmtT(d.toISOString()).replace(':', '')}`,
    '',
    line('LOAD IN COMPARTMENTS', g.holdKg) + (l.holds ? '   ' + l.holds.map((x, i) => `${i + 1}/${Math.round(toW(x.kg))}`).join(' ') : ''),
    line('PASSENGER / CABIN', g.paxKg) + `   TTL ${g.pax}` + (g.jump ? ` + ${g.jump} JUMP` : ''),
    line('TOTAL TRAFFIC LOAD', g.payload),
    line('DRY OPERATING WEIGHT', g.oew),
    line('ZERO FUEL WEIGHT', g.zfw, g.maxZfw),
    line('TAKE OFF FUEL', g.tof),
    line('TAKE OFF WEIGHT', g.tow, g.maxTow),
    line('TRIP FUEL', g.trip),
    line('LANDING WEIGHT', g.ldw, g.maxLdw),
    '',
    `PAX  BOOKED ${l.booked}  SEATS ${l.seats}` + (l.final ? `  NO-SHOW ${l.final.noShows}  LATE ${l.final.late}  FINAL ${l.final.pax}` : ''),
    `BAGS ${g.bags}   CARGO ${Math.round(toW(l.cargo))} ${u}`,
    `SI   ${Object.entries(count).map(([c, k]) => `${k} ${c}`).join('  ') || 'NIL'}`,
    l.final?.jump ? `SI   ${l.final.jump} COMPANY STAFF ON JUMPSEATS` : null,
  ].filter(x => x !== null).join('\n');
}

function summaryCard() {
  const f = S.flight, l = f.load, g = loadFigures(f);
  const editBooked = async () => {
    const v = await keypad({ title: 'Booked passengers', value: l.booked, allowClear: false });
    if (v) setF(['load', 'booked'], clamp(parseInt(v, 10) || 0, 0, l.seats));
  };
  const editSeats = async () => {
    const v = await keypad({ title: 'Seats in the cabin', value: l.seats, allowClear: false });
    if (v) { const seats = clamp(parseInt(v, 10) || 1, 1, 900); await setF(['load', 'seats'], seats); if (l.booked > seats) setF(['load', 'booked'], seats); }
  };
  const editCargo = async () => {
    const v = await keypad({ title: 'Cargo', unit: wUnit(), value: Math.round(toW(l.cargo)), allowClear: false });
    if (v) setF(['load', 'cargo'], parseFloat(v) / (wUnit() === 'lb' ? 2.2046226218 : 1));
  };
  const lock = !!l.final || !!f.closed;
  return h('div', { class: 'card c12' },
    h('h3', null, 'Passengers and load', h('span', { class: 'spacer' }), h('span', { class: 'tag ' + (l.final ? 'good' : 'warn') }, l.final ? `Final, edition ${l.edition}` : 'Preliminary')),
    h('div', { class: 'kv' },
      h('div', null, h('span', null, 'Seats'), lock ? h('b', { class: 'mono' }, l.seats) : h('button', { class: 'tap set', onclick: editSeats }, l.seats)),
      h('div', null, h('span', null, 'Booked'), lock ? h('b', { class: 'mono' }, l.booked) : h('button', { class: 'tap set', onclick: editBooked }, l.booked)),
      h('div', null, h('span', null, 'Final passengers'), h('b', { class: 'mono' }, l.final ? l.final.pax : '--'), l.final && h('small', null, `${l.final.noShows} no-show, ${l.final.late} late`)),
      h('div', null, h('span', null, 'Jumpseats (staff)'), h('b', { class: 'mono' }, l.final ? l.final.jump : '--'), h('small', null, 'Only on a full flight, max 5')),
      h('div', null, h('span', null, 'Bags'), h('b', { class: 'mono' }, g.bags)),
      h('div', null, h('span', null, 'Cargo'), lock ? h('b', { class: 'mono' }, fmtW(l.cargo)) : h('button', { class: 'tap set', onclick: editCargo }, fmtW(l.cargo))),
      h('div', null, h('span', null, 'Traffic load'), h('b', { class: 'mono' }, fmtW(g.payload))),
      h('div', null, h('span', null, 'Zero fuel weight'), h('b', { class: 'mono ' + (g.zfw != null && g.maxZfw != null && g.zfw > g.maxZfw ? 'bad' : '') }, fmtW(g.zfw)), g.maxZfw != null && h('small', null, 'Max ' + fmtW(g.maxZfw)))),
    !f.closed && h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn primary', onclick: finalise }, l.final ? 'Issue new edition' : 'Close boarding and issue final load sheet'),
      !l.final && h('button', { class: 'btn', onclick: generateBooking }, 'New booking figures')));
}

function specialsCard() {
  const f = S.flight, l = f.load;
  const add = async () => {
    const code = h('select', { class: 'input' }, SPECIAL_CODES.map(c => h('option', { value: c.code }, `${c.code}  ${c.text}`)));
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Passenger name' });
    const seatIn = h('input', { class: 'input', type: 'text', placeholder: 'Seat, for example 12A' });
    const note = h('input', { class: 'input', type: 'text', placeholder: 'Note (optional)' });
    const ok = await modal({ title: 'Special handling', body: h('div', { class: 'stack' }, code, name, seatIn, note), buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, primary: true }] });
    if (ok) push('flight', ['load', 'specials'], { code: code.value, name: name.value.trim().toUpperCase() || 'PASSENGER', seat: seatIn.value.trim().toUpperCase(), note: note.value.trim() });
  };
  return h('div', { class: 'card c6' },
    h('h3', null, 'Special handling', h('span', { class: 'spacer' }), !f.closed && h('button', { class: 'btn small', onclick: add }, 'Add')),
    l.specials.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Code', 'Passenger', 'Seat', 'Meaning', ''].map(x => h('th', null, x)))),
      h('tbody', null, l.specials.map((x, i) => h('tr', null,
        h('td', null, h('span', { class: 'tag accent' }, x.code)), h('td', null, x.name), h('td', { class: 'mono' }, x.seat || '-'),
        h('td', { class: 'muted' }, (SPECIAL_CODES.find(c => c.code === x.code)?.text || '') + (x.note ? '. ' + x.note : '')),
        h('td', { style: { width: '44px' } }, !f.closed && h('button', { class: 'btn small', 'aria-label': 'Remove', onclick: () => del('flight', ['load', 'specials', i]) }, '✕')))))))
      : h('div', { class: 'empty' }, 'No special handling passengers.'));
}

function signBlock(title, sig, onSign, disabled, hint) {
  return h('div', { class: 'stack' },
    sig ? h('div', { class: 'stack' }, h('img', { class: 'sig-img', src: sig.image, alt: 'Signature' }), h('small', { class: 'muted' }, `${sig.name}, ${fmtT(sig.time)}z`))
      : h('button', { class: 'btn primary', disabled, onclick: onSign }, title),
    !sig && hint && h('small', { class: 'muted' }, hint));
}

function sheetCard() {
  const f = S.flight, l = f.load;
  const sign = async key => {
    const pic = f.crew.find(c => c.role === 'PIC')?.name || S.settings.picName || '';
    const sig = await signaturePad({ title: key === 'sheetSig' ? 'Sign the load sheet' : 'Sign the LID', name: pic, nameLabel: 'Signed by' });
    if (!sig) return;
    await setF(['load', key], { ...sig, time: nowIso() });
    addNotice({ title: key === 'sheetSig' ? 'Load sheet signed' : 'LID signed', text: `Edition ${l.edition} signed by ${sig.name}.`, kind: 'good' });
  };
  return h('div', { class: 'card c6' },
    h('h3', null, 'Load sheet'),
    h('div', { class: 'stack' },
      h('div', { class: 'sheet' }, loadSheetText(f)),
      signBlock('Sign load sheet', l.sheetSig, () => sign('sheetSig'), !l.final || !!f.closed, 'Available once the final load sheet is issued.')));
}

function lidCard() {
  const f = S.flight, l = f.load;
  const sign = async () => {
    const pic = f.crew.find(c => c.role === 'PIC')?.name || S.settings.picName || '';
    const sig = await signaturePad({ title: 'Sign the LID', name: pic, nameLabel: 'Signed by' });
    if (!sig) return;
    await setF(['load', 'lidSig'], { ...sig, time: nowIso() });
    addNotice({ title: 'LID signed', text: `Loading instruction edition ${l.edition} signed by ${sig.name}.`, kind: 'good' });
  };
  return h('div', { class: 'card c12' },
    h('h3', null, 'LID: loading instruction and report'),
    l.holds ? h('div', { class: 'stack' },
      h('div', { class: 'holds' }, l.holds.map(x => h('div', { class: 'hold' }, h('span', { class: 'muted' }, x.name), h('b', { class: 'mono' }, num(toW(x.kg))), h('small', { class: 'muted' }, wUnit()))),
        h('div', { class: 'hold' }, h('span', { class: 'muted' }, 'Total'), h('b', { class: 'mono' }, num(toW(l.holds.reduce((a, x) => a + x.kg, 0)))), h('small', { class: 'muted' }, wUnit()))),
      h('p', { class: 'muted' }, `Bags ${l.final.bags}, cargo ${fmtW(l.cargo)}. Loaded as instructed, load secured, holds closed.`),
      signBlock('Sign LID', l.lidSig, sign, !!f.closed))
      : h('div', { class: 'empty' }, 'The hold distribution appears with the final load sheet.'));
}

export default {
  deps: ['flight', 'settings'],
  render(root) {
    const f = S.flight;
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'Loads')));
    if (!f.dep) { root.append(h('div', { class: 'card empty' }, 'Start a flight first.')); return; }
    if (!f.load) {
      root.append(h('div', { class: 'card' }, h('h3', null, 'Passengers and load'),
        h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Create the booking figures for this flight. Passenger numbers come from your SimBrief plan when available.'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: generateBooking }, 'Create booking figures')))));
      return;
    }
    root.append(h('div', { class: 'grid' }, summaryCard(), sheetCard(), specialsCard(), lidCard()));
  },
};
