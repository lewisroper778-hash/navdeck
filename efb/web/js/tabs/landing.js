// Landing: touchdown plotter, landing rate and the go-around log.
import { S, h, api, fmtT, fmtAlt, num, setF } from '../core.js';
import { drawTouchdown, lateralText, rateRating, rateClass, modal, confirmBox, toast } from '../widgets.js';
import { GO_AROUND_REASONS } from '../data.js';

async function editReason(i) {
  const g = S.flight.goArounds[i];
  const select = h('select', { class: 'input' }, h('option', { value: '' }, 'Choose the reason…'), GO_AROUND_REASONS.map(r => h('option', { value: r, selected: r === g.reason }, r)));
  const remark = h('input', { class: 'input', type: 'text', value: g.remark || '', placeholder: 'Remarks' });
  const ok = await modal({ title: `Go-around at ${fmtT(g.time)}z`, body: h('div', { class: 'stack' }, select, remark), buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
  if (!ok) return;
  await setF(['goArounds', i, 'reason'], select.value);
  await setF(['goArounds', i, 'remark'], remark.value.trim());
}

// In case a go-around was not detected (unusual profile or sim data), the pilot can log it by hand.
async function logGoAround() {
  const now = new Date();
  const time = h('input', { class: 'input mono', type: 'time', value: now.toISOString().slice(11, 16) });
  const height = h('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'Lowest height (ft AGL), optional' });
  const select = h('select', { class: 'input' }, h('option', { value: '' }, 'Choose the reason…'), GO_AROUND_REASONS.map(r => h('option', { value: r }, r)));
  const remark = h('input', { class: 'input', type: 'text', placeholder: 'Remarks' });
  const ok = await modal({
    title: 'Log a go-around',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Use this if the EFB did not detect your go-around. A safety report will be required before the flight can be closed.'),
      h('label', { class: 'field' }, h('span', null, 'Time (UTC)'), time),
      h('label', { class: 'field' }, h('span', null, 'Lowest height'), height),
      h('label', { class: 'field' }, h('span', null, 'Reason'), select), remark),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Log go-around', value: true, primary: true }],
  });
  if (!ok) return;
  const [hh, mm] = (time.value || now.toISOString().slice(11, 16)).split(':').map(Number);
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm));
  if (at - now > 3600e3) at.setUTCDate(at.getUTCDate() - 1);   // a time just before midnight UTC
  const entry = { time: at.toISOString(), raFt: height.value === '' ? null : +height.value, reason: select.value, remark: remark.value.trim(), manual: true };
  await setF(['goArounds'], [...(S.flight.goArounds || []), entry].sort((a, b) => a.time.localeCompare(b.time)));
  toast(select.value ? 'Go-around logged.' : 'Go-around logged. Enter the reason before closing the flight.', 'good');
}

async function undoLanding() {
  const ok = await confirmBox('Undo this landing?',
    'Use this if the aircraft only touched the ground by accident or the landing was recorded at the wrong time. The landing time, fuel and touchdown are cleared and the flight continues; the next landing is recorded automatically.',
    'Undo landing', true);
  if (!ok) return;
  try {
    await api('/api/flight/undo-landing', { method: 'POST', body: {} });
  } catch (e) {
    toast(e.message, 'bad', 'Landing not undone');
  }
}

export const eventHeight = g => (g.kind === 'touch-and-go' ? 'Touch-and-go' : g.raFt != null ? fmtAlt(Math.round(g.raFt)) + ' AGL' : '--');

export default {
  deps: ['flight', 'settings'],
  render(root) {
    const f = S.flight, l = f.landing;
    const canvas = h('canvas', { style: { width: '100%', height: '260px', display: 'block', borderRadius: '10px' } });
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'Landing')),
      h('div', { class: 'grid' },
        h('div', { class: 'card c4' }, h('h3', null, 'Landing rate'),
          h('div', { class: 'big mono ' + rateClass(l?.rate) }, l?.rate != null ? num(l.rate) + ' fpm' : '--'),
          h('div', { class: 'muted', style: { marginTop: '6px' } }, l?.rate != null ? rateRating(l.rate) : 'Recorded automatically at touchdown')),
        h('div', { class: 'card c8' }, h('h3', null, 'Touchdown'),
          h('div', { class: 'kv' },
            h('div', null, h('span', null, 'Runway'), h('b', null, l?.runway ? `${l.runway} ${l.airport || ''}` : '--')),
            h('div', null, h('span', null, 'From threshold'), h('b', { class: 'mono' }, l?.distFt != null ? fmtAlt(l.distFt) : '--')),
            h('div', null, h('span', null, 'Centreline'), h('b', null, l?.offsetFt != null ? lateralText(l.offsetFt) : '--')),
            h('div', null, h('span', null, 'Ground speed'), h('b', { class: 'mono' }, l?.gsKt != null ? num(l.gsKt) + ' kt' : '--')),
            h('div', null, h('span', null, 'Time'), h('b', { class: 'mono' }, fmtT(f.times.on) + (f.times.on ? 'z' : ''))))),
        h('div', { class: 'card c12' }, h('h3', null, 'Touchdown plotter', h('span', { class: 'spacer' }),
          (l || f.times.on) && !f.closed && !f.times.in && h('button', { class: 'btn small danger', onclick: undoLanding }, 'Undo landing')), canvas),
        h('div', { class: 'card c12' }, h('h3', null, 'Go-arounds and touch-and-goes', h('span', { class: 'spacer' }),
          !f.closed && f.times.off && h('button', { class: 'btn small', onclick: logGoAround }, 'Log a go-around')),
          f.goArounds.length ? h('table', { class: 'tbl' },
            h('thead', null, h('tr', null, ['Time', 'Height', 'Reason', 'Remarks', ''].map(x => h('th', null, x)))),
            h('tbody', null, f.goArounds.map((g, i) => h('tr', null,
              h('td', { class: 'mono' }, fmtT(g.time) + 'z'), h('td', { class: 'mono' }, eventHeight(g), g.manual ? h('small', { class: 'muted' }, ' (logged by hand)') : null),
              h('td', null, g.reason ? g.reason : h('span', { class: 'tag bad' }, 'Reason required')), h('td', null, g.remark || ''),
              h('td', { style: { width: '90px' } }, !f.closed && h('button', { class: 'btn small', onclick: () => editReason(i) }, g.reason ? 'Edit' : 'Enter'))))))
            : h('div', { class: 'empty' }, 'No go-arounds or touch-and-goes on this flight.'))));
    requestAnimationFrame(() => drawTouchdown(canvas, l));
  },
};
