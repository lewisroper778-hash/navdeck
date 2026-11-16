// GSX: the GSX remote inside the EFB (or in its own window) plus receipts and invoices for the journey log.
import { S, h, api, fmtT, setS, push, del, nowIso, num, addNotice, uid } from '../core.js';
import { modal, toast } from '../widgets.js';
import { RECEIPT_TYPES } from '../data.js';

let frame = null, shell = null, receipts = null, bar = null, shownUrl = '';

export function gsxUrl() {
  const g = S.settings.gsx;
  let host = (g.host || '127.0.0.1').trim();
  // On a tablet "this computer" means the tablet, so point at the PC that serves the EFB instead.
  if (/^(127\.0\.0\.1|localhost)$/i.test(host) && !/^(127\.0\.0\.1|localhost)$/i.test(location.hostname)) host = location.hostname;
  return `http://${host}:${g.port || 8380}${g.path || '/'}`;
}

async function detect() {
  toast('Looking for the GSX remote…');
  try {
    const r = await api('/api/gsx/probe?host=' + encodeURIComponent(S.settings.gsx.host) + '&port=' + encodeURIComponent(S.settings.gsx.port));
    if (r.ok) {
      if (r.port && r.port !== S.settings.gsx.port) await setS(['gsx', 'port'], r.port);
      toast(`Found on port ${r.port}.`, 'good', 'GSX remote found');
      frame.src = gsxUrl();
    } else toast('Nothing answered. Check that GSX and its remote are running, or set the address and port below.', 'warn', 'GSX remote not found');
  } catch (e) { toast(e.message, 'bad'); }
}

async function editConnection() {
  const g = S.settings.gsx;
  const host = h('input', { class: 'input', type: 'text', value: g.host });
  const port = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: g.port });
  const path = h('input', { class: 'input', type: 'text', value: g.path });
  const ok = await modal({
    title: 'GSX remote connection',
    body: h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', null, 'IP address of the PC running GSX'), host),
      h('label', { class: 'field' }, h('span', null, 'Port'), port),
      h('label', { class: 'field' }, h('span', null, 'Path'), path),
      h('p', { class: 'muted' }, 'Use 127.0.0.1 when GSX runs on the same PC as NAVDECK EFB. Tablets are pointed at that PC automatically.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }],
  });
  if (!ok) return;
  await setS(['gsx'], { host: host.value.trim() || '127.0.0.1', port: parseInt(port.value, 10) || 8380, path: path.value.trim() || '/' });
}

async function addReceipt() {
  const type = h('select', { class: 'input' }, RECEIPT_TYPES.map(t => h('option', null, t)));
  const text = h('input', { class: 'input', type: 'text', placeholder: 'Details, for example 6,200 kg Jet A-1' });
  const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.01', placeholder: 'Amount' });
  const ok = await modal({
    title: 'Add receipt or invoice',
    body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Service'), type),
      h('label', { class: 'field' }, h('span', null, 'Details'), text), h('label', { class: 'field' }, h('span', null, `Amount (${S.settings.currency})`), amount)),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Save receipt', value: true, primary: true }],
  });
  if (!ok) return;
  await push('flight', ['gsx', 'receipts'], { id: uid(), time: nowIso(), type: type.value, text: text.value.trim(), amount: parseFloat(amount.value) || 0, currency: S.settings.currency, auto: false });
  addNotice({ title: 'Receipt saved', text: `${type.value}: ${num(parseFloat(amount.value) || 0, 2)} ${S.settings.currency}`, kind: 'good' });
}

function renderBar() {
  const url = gsxUrl();
  bar.replaceChildren(
    h('span', { class: 'mono muted', style: { flex: '1', minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' } }, url),
    h('button', { class: 'btn small', onclick: detect }, 'Find GSX'),
    h('button', { class: 'btn small', onclick: editConnection }, 'Address and port'),
    h('button', { class: 'btn small', onclick: () => { frame.src = gsxUrl(); } }, 'Reload'),
    h('button', { class: 'btn small primary', onclick: () => window.open(gsxUrl(), 'gsx-remote', 'width=460,height=760') }, 'Open in its own window'));
  if (url !== shownUrl) { shownUrl = url; frame.src = url; }
}

function renderReceipts() {
  const f = S.flight, list = f.gsx.receipts || [];
  const total = list.reduce((a, r) => a + (r.amount || 0), 0);
  receipts.replaceChildren(
    h('h3', null, 'Receipts and invoices', h('span', { class: 'spacer' }), list.length > 0 && h('span', { class: 'tag' }, `Total ${num(total, 2)} ${S.settings.currency}`),
      !f.closed && h('button', { class: 'btn small', onclick: addReceipt }, 'Add receipt')),
    list.length ? h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Time', 'Service', 'Details', 'Amount', ''].map(x => h('th', null, x)))),
      h('tbody', null, list.map((r, i) => h('tr', null,
        h('td', { class: 'mono' }, fmtT(r.time) + 'z'), h('td', null, r.type, r.auto ? h('span', { class: 'tag accent', style: { marginLeft: '8px' } }, 'Automatic') : null),
        h('td', null, r.text), h('td', { class: 'num' }, `${num(r.amount, 2)} ${r.currency || ''}`),
        h('td', { style: { width: '44px' } }, !f.closed && h('button', { class: 'btn small', 'aria-label': 'Remove', onclick: () => del('flight', ['gsx', 'receipts', i]) }, '✕'))))))
      : h('div', { class: 'empty' }, 'Fuel uplift is saved automatically when refuelling is detected in the simulator. Other receipts can be added here. All of them appear in the journey log PDF.'));
}

export default {
  deps: ['flight', 'settings'],
  mount(root) {
    frame = h('iframe', { class: 'gsx-frame', title: 'GSX remote', referrerpolicy: 'no-referrer' });
    shell = h('div', { class: 'gsx-shell' }, frame);
    bar = h('div', { class: 'row', style: { marginBottom: '10px' } });
    receipts = h('div', { class: 'card c12' });
    shownUrl = '';
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'GSX')),
      h('div', { class: 'grid' }, h('div', { class: 'card c12' }, h('h3', null, 'GSX remote'), bar, shell,
        h('p', { class: 'muted', style: { marginTop: '10px' } }, 'If the panel stays empty, GSX may not allow being shown inside another page. Use "Open in its own window" instead.')), receipts));
    renderBar();
    renderReceipts();
  },
  update() { renderBar(); renderReceipts(); },
};
