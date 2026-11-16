// Actions shared by several tabs: starting a flight, fuel checks, sign and close, PDF export.
import { S, api, h, setF, setS, push, nowIso, fmtT, blankFlight, loadState, fromW, toW, wUnit, addNotice, hhmmToIso } from './core.js';
import { flightFromOfp, planAt, ofpFromFile } from './simbrief.js';
import { toast, modal, confirmBox, signaturePad, keypad } from './widgets.js';
import { GO_AROUND_REASONS } from './data.js';

export async function startFlight(flight) {
  await api('/api/flight/new', { method: 'POST', body: { flight } });
  await loadState();
  location.hash = '#flight';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function useOfp(ofp) {
  const flight = flightFromOfp(ofp);
  const profile = (S.settings.profiles || []).find(p => p.icao && p.icao.toUpperCase() === flight.airline.toUpperCase());
  if (profile) flight.profile = profile.id;
  await startFlight(flight);
  toast(`${flight.flightNo || flight.callsign}  ${flight.dep} to ${flight.arr}, ${flight.navlog.length} fixes`, 'good', 'SimBrief plan loaded');
}

// Pulls the latest plan for the saved SimBrief user (through the PC), or imports a saved SimBrief file.
export async function newFromSimbrief() {
  if (S.flight.dep && !S.flight.closed && !(await confirmBox('Replace the current flight?', 'The current flight has not been closed. Loading a new plan replaces it.', 'Replace', true))) return;
  const user = h('input', { class: 'input', type: 'text', value: S.settings.simbriefUser || '', placeholder: 'SimBrief username or pilot ID', autocapitalize: 'none', autocomplete: 'off' });
  const file = h('input', { class: 'input', type: 'file', accept: '.json,.xml,application/json,text/xml,application/xml' });
  const status = h('div', { class: 'warn-text' });
  const say = (text, error) => { status.textContent = text; status.style.color = error ? '' : 'var(--muted)'; };

  const pull = async close => {
    const name = user.value.trim();
    if (!name) { say('Enter your SimBrief username or pilot ID.', true); return; }
    say('Fetching your latest plan from SimBrief…');
    try {
      if (name !== S.settings.simbriefUser) await setS(['simbriefUser'], name);
      const ofp = await api('/api/simbrief?user=' + encodeURIComponent(name));
      if (!ofp?.origin) throw new Error('SimBrief returned no flight plan for that user.');
      close(null);
      await useOfp(ofp);
    } catch (e) { say(e.message, true); }
  };
  const importFile = async close => {
    if (!file.files.length) { say('Choose the SimBrief file first.', true); return; }
    say('Reading the file…');
    try {
      const ofp = await ofpFromFile(file.files[0]);
      close(null);
      await useOfp(ofp);
    } catch (e) { say(e.message, true); }
  };

  await modal({
    title: 'Load a SimBrief flight plan', wide: true,
    body: h('div', { class: 'grid' },
      h('div', { class: 'card c6 stack' },
        h('h3', null, 'Pull from SimBrief'),
        h('p', { class: 'muted' }, 'Fetches the latest plan you generated on simbrief.com. Your username is remembered.'),
        user, h('button', { class: 'btn primary', 'data-act': 'pull' }, 'Pull latest plan')),
      h('div', { class: 'card c6 stack' },
        h('h3', null, 'Import a SimBrief file'),
        h('p', { class: 'muted' }, 'A plan you saved from SimBrief as JSON or XML. Works without an internet connection.'),
        file, h('button', { class: 'btn', 'data-act': 'file' }, 'Import file')),
      h('div', { class: 'c12' }, status)),
    buttons: [{ label: 'Cancel', value: null }],
    onOpen: (box, close) => {
      box.querySelector('[data-act=pull]').addEventListener('click', () => pull(close));
      box.querySelector('[data-act=file]').addEventListener('click', () => importFile(close));
      user.addEventListener('keydown', e => { if (e.key === 'Enter') pull(close); });
      file.addEventListener('change', () => { if (file.files.length) importFile(close); });
    },
  });
}

export async function newBlank() {
  if (S.flight.dep && !S.flight.closed && !(await confirmBox('Replace the current flight?', 'The current flight has not been closed.', 'Replace', true))) return;
  const f = blankFlight();
  const fields = [['callsign', 'Callsign'], ['dep', 'From (ICAO)'], ['arr', 'To (ICAO)'], ['altn', 'Alternate (ICAO)'], ['type', 'Aircraft type'], ['reg', 'Registration']];
  const inputs = Object.fromEntries(fields.map(([k]) => [k, h('input', { class: 'input', type: 'text', autocapitalize: 'characters' })]));
  const ok = await modal({
    title: 'New flight without SimBrief',
    body: h('div', { class: 'grid' }, fields.map(([k, label]) => h('label', { class: 'field c6' }, h('span', null, label), inputs[k]))),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }],
  });
  if (!ok) return;
  fields.forEach(([k]) => { f[k] = inputs[k].value.trim().toUpperCase(); });
  f.flightNo = f.callsign;
  f.plan = { seats: 180, pax: 150, cargo: 1500, paxWeight: 84, bagWeight: 15 };
  await startFlight(f);
}

// ---------------------------------------------------------------- fuel checks
export async function recordFuelCheck() {
  const f = S.flight;
  let fob = S.sim.connected && S.sim.fobKg > 0 ? S.sim.fobKg : null;
  if (fob == null) {
    const typed = await keypad({ title: 'Fuel on board', unit: wUnit() });
    if (!typed) return;
    fob = fromW(parseFloat(typed));
  }
  const time = nowIso();
  await push('flight', ['fuelChecks'], { time, fob, plan: planAt(f, time), auto: false });
  await setF(['lastFuelCheck'], time);
  toast(`FOB ${Math.round(toW(fob)).toLocaleString('en-GB')} ${wUnit()} at ${fmtT(time)}z`, 'good', 'Fuel check recorded');
}

// ---------------------------------------------------------------- sign and close
async function askGoAroundReasons() {
  const f = S.flight;
  const missing = f.goArounds.map((g, i) => ({ g, i })).filter(x => !x.g.reason);
  if (!missing.length) return true;
  const rows = missing.map(({ g, i }) => {
    const select = h('select', { class: 'input' }, h('option', { value: '' }, 'Choose the reason…'), GO_AROUND_REASONS.map(r => h('option', { value: r }, r)));
    const remark = h('input', { class: 'input', type: 'text', placeholder: 'Remarks (optional, required for "Other")' });
    return { i, select, remark, el: h('div', { class: 'stack card' },
      h('b', null, (g.kind === 'touch-and-go' ? `Touch-and-go at ${fmtT(g.time)}z` : `Go-around at ${fmtT(g.time)}z` + (g.raFt != null ? `, ${Math.round(g.raFt)} ft above ground` : ''))), select, remark) };
  });
  const warn = h('div', { class: 'warn-text' });
  const ok = await modal({
    title: 'Go-around or touch-and-go: reason required', wide: true,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'A go-around was detected on this flight. Enter the reason before the journey log can be signed and closed.'),
      rows.map(r => r.el), warn),
    buttons: [{ label: 'Cancel', value: false }, {
      label: 'Save reasons', primary: true,
      validate: () => {
        for (const r of rows) {
          if (!r.select.value) { warn.textContent = 'Choose a reason for every go-around.'; return false; }
          if (r.select.value === 'Other' && !r.remark.value.trim()) { warn.textContent = 'Describe the reason when choosing "Other".'; return false; }
        }
        return true;
      },
    }],
  });
  if (!ok) return false;
  for (const r of rows) {
    await setF(['goArounds', r.i, 'reason'], r.select.value);
    await setF(['goArounds', r.i, 'remark'], r.remark.value.trim());
  }
  return true;
}

export async function signAndClose() {
  const f = S.flight;
  if (f.closed) { toast('This flight is already closed.'); return; }
  if (!f.dep) { toast('There is no flight to close.'); return; }
  if (!(await askGoAroundReasons())) return;
  if (!f.times.in && !(await confirmBox('No on-blocks time yet', 'The flight has no on-blocks (IN) time. Close it anyway?', 'Close anyway'))) return;

  const pic = f.crew.find(c => c.role === 'PIC')?.name || S.settings.picName || '';
  const sig = await signaturePad({
    title: 'PIC signature: sign and close the flight', name: pic, nameLabel: 'Pilot in command', okLabel: 'Sign and close',
    extra: h('p', { class: 'muted' }, 'By signing you confirm the journey log, fuel figures and reports for this flight are complete.'),
  });
  if (!sig) return;
  await setF(['closed'], { time: nowIso(), name: sig.name, signature: sig.image });
  if (!S.settings.picName) setS(['picName'], sig.name);
  let closing = null;
  try {
    closing = await api('/api/flight/close', { method: 'POST', body: {} });
  } catch (e) {
    await setF(['closed'], null);
    toast(e.message, 'bad', 'The flight could not be closed');
    return;
  }
  addNotice({ title: 'Flight closed', text: `${f.flightNo || f.callsign} signed by ${sig.name}.`, kind: 'good' });
  const next = await modal({
    title: 'Flight signed and closed',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'The journey log is saved in the logbook. You can export it as a PDF now or later from the Report tab.'),
      closing?.sending && h('p', null, 'It is also being emailed to NAVDECK (inflightreports@navdeck.online). If this PC is offline, it is sent automatically later.')),
    buttons: [{ label: 'Done', value: null }, { label: 'Open report', value: 'report' }, { label: 'Export PDF', value: 'pdf', primary: true }],
  });
  if (next === 'pdf') exportPdf(f.id);
  if (next === 'report') location.hash = '#report';
}

export async function exportPdf(id) {
  const flight = id === S.flight.id || !id ? S.flight : null;
  const name = `NAVDECK ${flight ? (flight.flightNo || flight.callsign || 'flight') + ' ' + flight.dep + '-' + flight.arr : 'journey log'}.pdf`;
  toast('Creating the PDF…');
  try {
    const res = await fetch('/api/report.pdf?id=' + encodeURIComponent(id || S.flight.id));
    if (!res.ok) throw new Error('unavailable');
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(name, 'good', 'PDF saved');
  } catch {
    // No PDF service (browser-only mode): open the printable report instead.
    window.open('report.html?id=' + encodeURIComponent(id || S.flight.id) + '&print=1', '_blank');
  }
}

// Tap-to-edit helpers used by NavLog and Times.
export async function editTime(title, path, current, refIso) {
  const typed = await keypad({ title, mode: 'time', value: current ? fmtT(current).replace(':', '') : '' });
  if (typed == null) return;
  await setF(path, typed === '' ? null : hhmmToIso(typed, refIso || current));
}
export async function editWeight(title, path, currentKg) {
  const typed = await keypad({ title, unit: wUnit(), value: currentKg != null ? Math.round(toW(currentKg)) : '' });
  if (typed == null) return;
  await setF(path, typed === '' ? null : fromW(parseFloat(typed)));
}
