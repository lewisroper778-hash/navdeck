// OCC: company messages, turnaround steps and delay codes. Every confirmation raises a notification.
import { S, h, fmtT, setF, push, del, nowIso, addNotice, uid } from '../core.js';
import { modal, promptText } from '../widgets.js';
import { IATA_DELAYS, TURNAROUND_STEPS } from '../data.js';

function messagesCard() {
  const f = S.flight;
  const list = Object.values(f.occ.messages || {}).sort((a, b) => (a.time < b.time ? 1 : -1));
  const ack = async m => {
    await setF(['occ', 'messages', m.id, 'ack'], nowIso());
    addNotice({ title: 'Message confirmed', text: m.text.slice(0, 90), kind: 'good' });
  };
  const send = async () => {
    const text = await promptText('Message to OCC', 'Your message', '', true);
    if (!text) return;
    const id = 'crew-' + uid();
    await setF(['occ', 'messages', id], { id, time: nowIso(), from: 'CREW', text, ack: nowIso() });
    addNotice({ title: 'Message sent to OCC', text, kind: 'good' });
  };
  return h('div', { class: 'card c7' },
    h('h3', null, 'Company messages', h('span', { class: 'spacer' }), !f.closed && h('button', { class: 'btn small', onclick: send }, 'Message OCC')),
    list.length ? h('div', { class: 'stack' }, list.map(m => h('div', { class: 'msg' + (m.ack ? '' : ' unread') },
      h('div', { class: 'body' },
        h('div', { class: 'meta' }, `${m.from}  ·  ${fmtT(m.time)}z` + (m.ack && m.from !== 'CREW' ? `  ·  confirmed ${fmtT(m.ack)}z` : '')),
        h('div', null, m.text)),
      !m.ack && h('button', { class: 'btn small primary', onclick: () => ack(m) }, 'Confirm'))))
      : h('div', { class: 'empty' }, 'Messages from operations appear here as the flight progresses.'));
}

function turnaroundCard() {
  const f = S.flight;
  const state = f.occ.turnaround || {};
  const toggle = async (i, label) => {
    const done = !state[i]?.done;
    await setF(['occ', 'turnaround', String(i)], { done, time: done ? nowIso() : null });
    if (done) addNotice({ title: 'Turnaround', text: `${label} confirmed.`, kind: 'good' });
  };
  const doneCount = TURNAROUND_STEPS.filter((_, i) => state[i]?.done).length;
  return h('div', { class: 'card c5' },
    h('h3', null, 'Turnaround', h('span', { class: 'spacer' }), h('span', { class: 'tag' + (doneCount === TURNAROUND_STEPS.length ? ' good' : '') }, `${doneCount} / ${TURNAROUND_STEPS.length}`)),
    h('div', null, TURNAROUND_STEPS.map((label, i) => h('div', { class: 'step' + (state[i]?.done ? ' done' : '') },
      h('button', { class: 'check', 'aria-label': label, disabled: !!f.closed, onclick: () => toggle(i, label) }, state[i]?.done ? '✓' : ''),
      h('span', { class: 'label' }, label),
      h('span', { class: 'mono muted' }, state[i]?.done ? fmtT(state[i].time) + 'z' : '')))));
}

function delaysCard() {
  const f = S.flight;
  const codes = [...(S.settings.customDelays || []).map(c => ({ ...c, custom: true })), ...IATA_DELAYS];
  const add = async () => {
    const select = h('select', { class: 'input' }, codes.map(c => h('option', { value: c.code }, `${c.code}${c.alpha ? ' (' + c.alpha + ')' : ''}  ${c.text}${c.custom ? '  [own]' : ''}`)));
    const minutes = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, placeholder: 'Minutes' });
    const remark = h('input', { class: 'input', type: 'text', placeholder: 'Remark (optional)' });
    const warn = h('div', { class: 'warn-text' });
    const ok = await modal({
      title: 'Add delay code',
      body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Delay code'), select),
        h('label', { class: 'field' }, h('span', null, 'Delay in minutes'), minutes), h('label', { class: 'field' }, h('span', null, 'Remark'), remark), warn),
      buttons: [{ label: 'Cancel', value: false }, { label: 'Add delay', primary: true, validate: () => { if (!(+minutes.value > 0)) { warn.textContent = 'Enter the minutes.'; return false; } return true; } }],
    });
    if (!ok) return;
    const c = codes.find(x => x.code === select.value);
    await push('flight', ['occ', 'delays'], { code: c.code, alpha: c.alpha || '', text: c.text, minutes: +minutes.value, remark: remark.value.trim(), time: nowIso() });
    addNotice({ title: 'Delay code recorded', text: `${c.code} ${c.text}: ${minutes.value} min`, kind: 'warn' });
  };
  const total = f.occ.delays.reduce((a, d) => a + d.minutes, 0);
  return h('div', { class: 'card c12' },
    h('h3', null, 'Delay codes', h('span', { class: 'spacer' }), total > 0 && h('span', { class: 'tag warn' }, `Total ${total} min`), !f.closed && h('button', { class: 'btn small', onclick: add }, 'Add delay')),
    f.occ.delays.length ? h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Code', 'Reason', 'Minutes', 'Remark', ''].map(x => h('th', null, x)))),
      h('tbody', null, f.occ.delays.map((d, i) => h('tr', null,
        h('td', null, h('span', { class: 'tag warn' }, d.code + (d.alpha ? ' ' + d.alpha : ''))), h('td', null, d.text), h('td', { class: 'num' }, d.minutes), h('td', null, d.remark || ''),
        h('td', { style: { width: '44px' } }, !f.closed && h('button', { class: 'btn small', 'aria-label': 'Remove', onclick: () => del('flight', ['occ', 'delays', i]) }, '✕'))))))
      : h('div', { class: 'empty' }, 'No delays recorded. IATA codes and your own codes (Settings) are available.'));
}

export default {
  deps: ['flight', 'settings'],
  render(root) {
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'OCC')),
      h('div', { class: 'grid' }, messagesCard(), turnaroundCard(), delaysCard()));
  },
};
