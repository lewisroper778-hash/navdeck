// Safety: pilots open safety reports, complete them, then sign and close them. Closing locks the report and posts it to Discord.
import { S, h, api, set, del, fmtT, fmtDate } from '../core.js';
import { modal, confirmBox, toast, signaturePad } from '../widgets.js';
import { SAFETY_TYPES, SEVERITIES, OUTCOMES, safetyType, suggestedReports } from '../safety-types.js';

let filter = 'open', selected = '';
let root = null;

const reports = () => Object.values(S.safety?.reports || {}).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
const icon = d => h('span', { style: { display: 'grid' }, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" class="sr-icon"><path d="${d}"/></svg>` });
const sevClass = s => (s === 'High' ? 'bad' : s === 'Medium' ? 'warn' : s === 'Low' ? 'good' : '');
const path = (r, ...p) => ['reports', r.id, ...p];

function flightRef(f) {
  if (!f || f.id === 'none' || !(f.dep || f.flightNo || f.callsign)) return {};
  return { id: f.id, flightNo: f.flightNo || f.callsign || '', dep: f.dep || '', arr: f.diversion?.to || f.arr || '', type: f.type || '', reg: f.reg || '', date: f.times?.out || f.created || '' };
}

export async function openReport(typeId) {
  const type = safetyType(typeId);
  if (!type) return null;
  const f = S.flight;
  const fields = {}, labels = {};
  for (const fd of type.fields) {
    labels[fd.k] = fd.label;
    const v = fd.auto ? fd.auto(f) : '';
    if (v !== '' && v != null) fields[fd.k] = v;
  }
  const r = await api('/api/safety/open', { method: 'POST', body: {
    type: type.id, typeName: type.name, openedBy: f.crew?.find(c => c.role === 'PIC')?.name || S.settings.picName || '',
    flight: flightRef(f), fields, labels, required: type.fields.filter(fd => fd.req).map(fd => fd.k), narrative: '',
  } });
  S.safety.reports[r.id] = r;
  selected = r.id; filter = 'open';
  toast(`${r.number} is open. Complete it, then sign and close it.`, 'good', 'Safety report opened');
  if (location.hash !== '#safety') location.hash = 'safety'; else draw();
  return r;
}

async function chooseType() {
  const pick = await modal({
    title: 'New safety report', wide: true,
    body: h('div', { class: 'sr-types' }, SAFETY_TYPES.map(t => h('button', { class: 'sr-type', 'data-type': t.id, onclick: e => e.currentTarget.closest('.modal').dispatchEvent(new CustomEvent('pick', { detail: t.id })) },
      icon(t.icon), h('b', null, t.name), h('small', null, t.hint)))),
    buttons: [{ label: 'Cancel', value: null }],
    onOpen: (el, close) => el.addEventListener('pick', e => close(e.detail)),
  });
  if (pick) await openReport(pick);
}

function missing(r) {
  const type = safetyType(r.type);
  const out = [];
  if (!r.severity) out.push('Severity');
  if ((r.narrative || '').trim().length < 10) out.push('What happened');
  for (const fd of type?.fields || []) if (fd.req && (r.fields?.[fd.k] === '' || r.fields?.[fd.k] == null)) out.push(fd.label);
  return out;
}

async function closeReport(r) {
  const gaps = missing(r);
  if (gaps.length) { toast('Complete first: ' + gaps.join(', ') + '.', 'bad', 'Not ready to close'); return; }
  const outcome = h('select', { class: 'input' }, OUTCOMES.map(o => h('option', null, o)));
  const actions = h('textarea', { class: 'input', rows: 3, placeholder: 'Actions taken or recommended (optional)' });
  const sig = await signaturePad({
    title: `Close ${r.number}`, name: r.openedBy || S.settings.picName || '', okLabel: 'Sign and close',
    extra: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Closing locks the report. It cannot be changed afterwards and is posted to the NAVDECK Discord.'),
      h('label', { class: 'field' }, h('span', null, 'Outcome'), outcome),
      h('label', { class: 'field' }, h('span', null, 'Actions'), actions)),
  });
  if (!sig) return;
  try {
    const res = await api('/api/safety/close', { method: 'POST', body: { id: r.id, name: sig.name, signature: sig.image, outcome: outcome.value, actions: actions.value.trim() } });
    filter = 'closed'; selected = r.id; draw();   // keep the closed report on screen
    toast(res.sending ? 'Closed and queued for the NAVDECK Discord.' : 'Closed. Posting to Discord is switched off or not available in this build.', 'good', `${r.number} closed`);
  } catch (err) {
    toast(err.message, 'bad', 'Could not close');
  }
}

// ---------------------------------------------------------------- drawing

function input(r, fd, locked) {
  const v = r.fields?.[fd.k] ?? '';
  const save = val => set('safety', path(r, 'fields', fd.k), val);
  if (locked) return h('div', { class: 'sr-val' }, v === '' ? '--' : String(v));
  if (fd.kind === 'select') {
    const el = h('select', { class: 'input' }, h('option', { value: '' }, 'Choose...'), fd.options.map(o => h('option', { selected: o === v }, o)));
    el.addEventListener('change', () => save(el.value));
    return el;
  }
  if (fd.kind === 'yesno') return h('div', { class: 'seg' }, ['Yes', 'No'].map(o => h('button', { class: v === o ? 'on' : '', onclick: () => save(o) }, o)));
  const el = h('input', { class: 'input', type: fd.kind === 'num' ? 'number' : 'text', inputmode: fd.kind === 'num' ? 'numeric' : undefined, value: v, placeholder: fd.placeholder || '' });
  el.addEventListener('change', () => save(fd.kind === 'num' ? (el.value === '' ? '' : +el.value) : el.value.trim()));
  return el;
}

function editor(r) {
  const type = safetyType(r.type) || { name: r.typeName, fields: [], icon: '' };
  const locked = r.status === 'closed';
  const fl = r.flight || {};
  const gaps = locked ? [] : missing(r);
  const narrative = h('textarea', { class: 'input', rows: 6, placeholder: 'What happened, in time order. What you saw, what you did and why.', disabled: locked }, r.narrative || '');
  narrative.value = r.narrative || '';
  narrative.addEventListener('change', () => set('safety', path(r, 'narrative'), narrative.value));
  const title = h('input', { class: 'input', type: 'text', value: r.title || '', placeholder: 'Short title (optional)', disabled: locked });
  title.addEventListener('change', () => set('safety', path(r, 'title'), title.value.trim()));
  const discord = r.discord === 'sending' ? h('span', { class: 'tag' }, 'Posting to Discord...')
    : r.discord === 'failed' ? h('span', { class: 'tag bad' }, 'Discord did not accept it')
      : r.discord === 'off' ? h('span', { class: 'tag' }, 'Not posted (reports off)')
        : r.discord ? h('span', { class: 'tag good' }, 'Posted to Discord ' + fmtT(r.discord) + 'z') : null;

  return h('div', { class: 'card sr-editor' },
    h('div', { class: 'sr-head' },
      h('div', { class: 'sr-badge' }, icon(type.icon)),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { class: 'muted mono', style: { fontSize: '12px' } }, r.number + '  ·  opened ' + fmtDate(r.openedAt) + ' ' + fmtT(r.openedAt) + 'z' + (r.openedBy ? '  ·  ' + r.openedBy : '')),
        h('h3', { style: { margin: '2px 0 0', textTransform: 'none', letterSpacing: '0', fontSize: '18px' } }, type.name)),
      h('span', { class: 'chip ' + (locked ? 'c-good' : 'c-warn') }, locked ? 'Closed' : 'Open')),
    h('div', { class: 'kv', style: { margin: '12px 0' } },
      h('div', null, h('span', null, 'Flight'), h('b', null, fl.flightNo || '--')),
      h('div', null, h('span', null, 'Route'), h('b', null, fl.dep ? `${fl.dep}-${fl.arr}` : '--')),
      h('div', null, h('span', null, 'Aircraft'), h('b', null, [fl.type, fl.reg].filter(Boolean).join(' ') || '--'))),
    h('div', { class: 'stack' },
      locked ? (r.title && h('div', { class: 'sr-val', style: { fontWeight: '700' } }, r.title)) : title,
      h('div', { class: 'field' }, h('span', null, 'Severity *'),
        locked ? h('div', null, h('span', { class: 'tag ' + sevClass(r.severity) }, r.severity || '--'))
          : h('div', { class: 'seg' }, SEVERITIES.map(([s, hint]) => h('button', { class: r.severity === s ? 'on' : '', title: hint, onclick: () => set('safety', path(r, 'severity'), s) }, s)))),
      h('div', { class: 'sr-fields' }, type.fields.map(fd => h('label', { class: 'field' }, h('span', null, fd.label + (fd.req ? ' *' : '')), input(r, fd, locked)))),
      h('label', { class: 'field' }, h('span', null, 'What happened *'), locked ? h('div', { class: 'sr-val sr-text' }, r.narrative) : narrative)),
    locked
      ? h('div', { class: 'sr-closed' },
        h('div', { class: 'row' }, h('b', null, 'Closed ' + fmtDate(r.closed?.time) + ' ' + fmtT(r.closed?.time) + 'z by ' + (r.closed?.name || '--')), h('span', { class: 'spacer' }), discord),
        h('div', null, h('span', { class: 'muted' }, 'Outcome: '), r.closed?.outcome || '--'),
        r.closed?.actions && h('div', null, h('span', { class: 'muted' }, 'Actions: '), r.closed.actions),
        r.closed?.signature && h('img', { class: 'sig-img', src: r.closed.signature, alt: 'Signature', style: { maxWidth: '220px' } }))
      : h('div', { class: 'row sr-foot' },
        h('span', { class: gaps.length ? 'warn-text' : 'muted' }, gaps.length ? 'Still needed: ' + gaps.join(', ') : 'Ready to close.'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: async () => { if (await confirmBox('Delete report', `Delete ${r.number}? Open reports can be deleted; closed ones cannot.`, 'Delete', true)) { del('safety', path(r)); selected = ''; draw(); } } }, 'Delete'),
        h('button', { class: 'btn primary', onclick: () => closeReport(r) }, 'Sign and close')));
}

function listItem(r) {
  const t = safetyType(r.type);
  return h('button', { class: 'sr-item' + (r.id === selected ? ' on' : ''), onclick: () => { selected = r.id; draw(); } },
    h('div', { class: 'sr-badge small' }, icon(t?.icon || '')),
    h('div', { class: 'sr-item-body' },
      h('div', { class: 'sr-item-top' }, h('b', null, r.typeName || t?.name), h('span', { class: 'tag ' + sevClass(r.severity) }, r.severity || 'No severity')),
      h('small', { class: 'muted mono' }, `${r.number}  ·  ${r.flight?.flightNo || '--'} ${r.flight?.dep ? r.flight.dep + '-' + r.flight.arr : ''}`),
      r.title && h('small', null, r.title)),
    h('span', { class: 'sr-dot ' + (r.status === 'closed' ? 'closed' : 'open') }));
}

function draw() {
  if (!root) return;
  const all = reports();
  const open = all.filter(r => r.status !== 'closed'), closed = all.filter(r => r.status === 'closed');
  const shown = filter === 'open' ? open : filter === 'closed' ? closed : all;
  if (!shown.some(r => r.id === selected)) selected = shown[0]?.id || '';
  const current = S.safety.reports[selected];
  const tips = suggestedReports(S.flight, S.safety.reports);

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('h2', null, 'Safety'),
      h('div', { class: 'seg' }, [['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`], ['all', 'All']].map(([k, l]) => h('button', { class: filter === k ? 'on' : '', onclick: () => { filter = k; draw(); } }, l))),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: chooseType }, 'New report')),
    tips.length ? h('div', { class: 'banner b-warn', style: { marginBottom: '14px' } }, h('div', { class: 'stack', style: { gap: '6px', flex: '1' } },
      tips.map(t => h('div', { class: 'row' }, h('span', { style: { flex: '1' } }, h('b', null, safetyType(t.type).name + ' suggested. '), t.why + '.'),
        h('button', { class: 'btn small primary', onclick: () => openReport(t.type) }, 'Open report'))))) : null,
    h('div', { class: 'sr-layout' },
      h('div', { class: 'card sr-list' }, shown.length ? shown.map(listItem)
        : h('div', { class: 'empty' }, filter === 'closed' ? 'No closed reports yet.' : 'No open safety reports. Use New report to file one.')),
      current ? editor(current) : h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('div', { style: { fontWeight: '700', marginBottom: '6px' } }, 'Safety reports'),
        'Open a report for anything that affected safety. Complete it, then sign and close it. Closed reports are locked and posted to the NAVDECK Discord.'))));
}

export default {
  deps: ['safety', 'flight', 'settings'],
  mount(el) { root = el; draw(); },
  update() { draw(); },
  unmount() { root = null; },
};
