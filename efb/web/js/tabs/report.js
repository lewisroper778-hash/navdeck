// Report: journey log preview, sign and close, PDF export and sending to the company.
import { S, h, fmtT } from '../core.js';
import { signAndClose, exportPdf } from '../actions.js';
import { toast } from '../widgets.js';

let frame = null, head = null, timer = null;

async function sendToCompany() {
  const f = S.flight;
  const subject = `Journey log ${f.flightNo || f.callsign} ${f.dep}-${f.arr}`;
  try {
    const res = await fetch('/api/report.pdf?id=' + encodeURIComponent(f.id));
    if (res.ok && navigator.canShare) {
      const file = new File([await res.blob()], subject + '.pdf', { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: subject }); return; }
    }
  } catch { /* fall back to e-mail below */ }
  const to = S.settings.companyEmail || '';
  if (!to) toast('Add the company e-mail address in Settings. Export the PDF and attach it to the message.', 'info', 'Send to company');
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('Journey log attached.\n\nExport the PDF from NAVDECK EFB and attach it to this message.')}`;
}

function renderHead() {
  const f = S.flight;
  head.replaceChildren(h('h2', null, 'Report'), h('div', { class: 'spacer' }),
    f.closed ? h('span', { class: 'tag good' }, `Signed by ${f.closed.name}, ${fmtT(f.closed.time)}z`) : h('span', { class: 'tag warn' }, 'Draft, not signed'),
    !f.closed && h('button', { class: 'btn', onclick: signAndClose, disabled: !f.dep }, 'Sign and close flight'),
    h('button', { class: 'btn', onclick: sendToCompany, disabled: !f.dep }, 'Send to company'),
    h('button', { class: 'btn', onclick: () => window.open('report.html?id=' + encodeURIComponent(f.id), '_blank'), disabled: !f.dep }, 'Open full page'),
    h('button', { class: 'btn primary', onclick: () => exportPdf(f.id), disabled: !f.dep }, 'Export PDF'));
}

export default {
  deps: ['flight', 'settings'],
  mount(root) {
    head = h('div', { class: 'page-head' });
    frame = h('iframe', { title: 'Journey log', style: { width: '100%', height: 'calc(100dvh - 170px)', border: '1px solid var(--line)', borderRadius: '12px', background: '#e8e8ec' } });
    root.append(head, frame);
    renderHead();
    frame.src = 'report.html?embed=1&id=' + encodeURIComponent(S.flight.id);
  },
  update() {
    renderHead();
    clearTimeout(timer);
    timer = setTimeout(() => { if (frame?.isConnected) frame.src = 'report.html?embed=1&id=' + encodeURIComponent(S.flight.id) + '&t=' + Date.now(); }, 900);
  },
  unmount() { clearTimeout(timer); },
};
