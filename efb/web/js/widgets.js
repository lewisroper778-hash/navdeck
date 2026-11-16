// Touch-first widgets: dialogs, toasts, keypad, signature pad and the touchdown plot.
import { h, num, fmtAlt } from './core.js';

// ---------------------------------------------------------------- toast
export function toast(text, kind = 'info', title = '') {
  let host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: 'toast k-' + kind }, title && h('b', null, title), h('span', null, text));
  while (host.children.length >= 3) host.firstChild.remove();
  host.append(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

// ---------------------------------------------------------------- modal
export function modal({ title, body, buttons = [{ label: 'Close', value: null }], wide = false, onOpen }) {
  return new Promise(resolve => {
    const close = value => { back.remove(); resolve(value); };
    const footer = h('div', { class: 'modal-foot' }, buttons.map(b =>
      h('button', {
        class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
        onclick: async () => {
          if (b.validate) {
            const result = await b.validate();
            if (result === false) return;
            close(result === undefined ? b.value : result);
          } else close(b.value);
        },
      }, b.label)));
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog' },
      h('div', { class: 'modal-head' }, h('h3', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close(null) }, '✕')),
      h('div', { class: 'modal-body' }, body), footer);
    const back = h('div', { class: 'modal-back', onpointerdown: e => { if (e.target === back) close(null); } }, box);
    document.body.append(back);
    if (onOpen) onOpen(box, close);
  });
}
export const confirmBox = (title, text, okLabel = 'Confirm', danger = false) =>
  modal({ title, body: h('p', { class: 'muted' }, text), buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: !danger, danger }] });

export function promptText(title, label, value = '', multiline = false) {
  const input = multiline ? h('textarea', { class: 'input', rows: 4 }) : h('input', { class: 'input', type: 'text' });
  input.value = value;
  return modal({
    title, body: h('label', { class: 'field' }, h('span', null, label), input),
    buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, validate: () => input.value.trim() }],
    onOpen: () => setTimeout(() => input.focus(), 50),
  });
}

// ---------------------------------------------------------------- keypad
// mode 'time' collects HHMM, mode 'number' a number. Resolves to the typed string or null.
export function keypad({ title, mode = 'number', value = '', unit = '', allowClear = true }) {
  return new Promise(resolve => {
    let text = String(value ?? '').replace(mode === 'time' ? /\D/g : /[^\d.]/g, '');
    const display = h('div', { class: 'keypad-display' });
    const show = () => {
      if (mode === 'time') {
        const t = text.padEnd(4, '_');
        display.textContent = t.slice(0, 2) + ':' + t.slice(2, 4) + ' z';
      } else display.textContent = (text === '' ? '0' : text) + (unit ? ' ' + unit : '');
    };
    const press = key => {
      if (key === 'C') text = '';
      else if (key === '⌫') text = text.slice(0, -1);
      else if (key === '.') { if (mode === 'number' && !text.includes('.')) text += '.'; }
      else if (mode === 'time' ? text.length < 4 : text.length < 9) text += key;
      show();
    };
    const done = v => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const ok = () => {
      if (mode === 'time' && text.length !== 4) return;
      done(text);
    };
    const onKey = e => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === '.') press('.');
      else if (e.key === 'Enter') ok();
      else if (e.key === 'Escape') done(null);
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'time' ? 'C' : '.', '0', '⌫'];
    const box = h('div', { class: 'modal keypad' },
      h('div', { class: 'modal-head' }, h('h3', null, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => done(null) }, '✕')),
      display,
      h('div', { class: 'keypad-grid' }, keys.map(k => h('button', { class: 'key', onclick: () => press(k) }, k))),
      h('div', { class: 'modal-foot' },
        allowClear && h('button', { class: 'btn', onclick: () => done('') }, 'Clear value'),
        h('button', { class: 'btn primary', onclick: ok }, 'Enter')));
    const back = h('div', { class: 'modal-back', onpointerdown: e => { if (e.target === back) done(null); } }, box);
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    show();
  });
}

// ---------------------------------------------------------------- signature pad (finger, mouse or Apple Pencil)
export function attachInk(canvas, { color = '#10203a', width = 2.4, onChange } = {}) {
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, dirty = false;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height, p: e.pressure || 0.5 };
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width * (canvas.width / canvas.getBoundingClientRect().width) * (e.pointerType === 'pen' ? 0.5 + p.p : 1);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    dirty = true;
  });
  const end = () => { if (drawing) { drawing = false; if (onChange) onChange(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; if (onChange) onChange(); },
    get dirty() { return dirty; },
  };
}

export function signaturePad({ title, name = '', nameLabel = 'Name', extra = null, okLabel = 'Sign' }) {
  const canvas = h('canvas', { class: 'sig-canvas', width: 900, height: 300 });
  const ink = attachInk(canvas);
  const nameInput = h('input', { class: 'input', type: 'text', value: name, placeholder: nameLabel });
  const warn = h('div', { class: 'warn-text' });
  return modal({
    title, wide: true,
    body: h('div', { class: 'stack' },
      extra,
      h('label', { class: 'field' }, h('span', null, nameLabel), nameInput),
      h('div', { class: 'sig-wrap' }, canvas, h('span', { class: 'sig-hint' }, 'Sign here with your finger or Apple Pencil')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => ink.clear() }, 'Clear'), warn)),
    buttons: [{ label: 'Cancel', value: null }, {
      label: okLabel, primary: true,
      validate: () => {
        if (!nameInput.value.trim()) { warn.textContent = 'Enter the name first.'; return false; }
        if (!ink.dirty) { warn.textContent = 'Please sign in the box.'; return false; }
        return { name: nameInput.value.trim(), image: canvas.toDataURL('image/png') };
      },
    }],
  });
}

// ---------------------------------------------------------------- touchdown plot
export function drawTouchdown(canvas, landing, opts = {}) {
  const css = getComputedStyle(document.documentElement);
  const light = opts.light;
  const col = name => (light ? { '--card': '#ffffff', '--text': '#18202e', '--muted': '#6e7a8c', '--line': '#d6dde6', '--good': '#109664', '--bad': '#d63c3c' }[name]
    : css.getPropertyValue(name).trim());
  const ratio = opts.ratio || Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || opts.width || 800, hgt = canvas.clientHeight || opts.height || 220;
  canvas.width = w * ratio;
  canvas.height = hgt * ratio;
  const g = canvas.getContext('2d');
  g.scale(ratio, ratio);
  g.fillStyle = col('--card');
  g.fillRect(0, 0, w, hgt);
  g.textBaseline = 'top';

  if (!landing || landing.distFt == null || !landing.lengthFt) {
    g.fillStyle = col('--muted');
    g.font = '14px system-ui, Segoe UI, sans-serif';
    g.textAlign = 'center';
    g.fillText(landing ? 'Runway not identified for this landing' : 'Waiting for touchdown…', w / 2, hgt / 2 - 8);
    return;
  }
  const length = Math.max(1000, landing.lengthFt), width = Math.max(60, landing.widthFt || 150);
  const dist = Math.max(0, Math.min(length, landing.distFt)), offset = landing.offsetFt || 0;
  const m = Math.max(18, w * 0.03), x0 = m, x1 = w - m, sx = (x1 - x0) / length;
  const band = Math.max(36, Math.min(84, hgt * 0.34)), cy = hgt * 0.54, top = cy - band / 2, bottom = cy + band / 2, sy = band / width;

  g.textAlign = 'left';
  g.fillStyle = col('--text');
  g.font = '600 15px system-ui, Segoe UI, sans-serif';
  g.fillText(`RWY ${landing.runway}  ${landing.airport || ''}`, x0, 10);
  g.textAlign = 'right';
  g.fillStyle = col('--muted');
  g.font = '13px system-ui, Segoe UI, sans-serif';
  g.fillText(`${fmtAlt(landing.distFt)} from threshold  |  ${lateralText(offset)}`, x1, 12);

  g.fillStyle = light ? '#464c58' : '#343c4a';
  g.fillRect(x0, top, x1 - x0, band);
  g.fillStyle = 'rgba(52,211,153,0.16)';
  g.fillRect(x0, top, Math.min(3000, length) * sx, band);
  g.strokeStyle = '#e1e6ee';
  g.lineWidth = 1.5;
  g.strokeRect(x0, top, x1 - x0, band);
  g.setLineDash([8, 8]);
  g.beginPath(); g.moveTo(x0 + 26, cy); g.lineTo(x1 - 10, cy); g.stroke();
  g.setLineDash([]);
  for (let i = 0; i < 6; i++) {
    const y = top + 6 + i * (band - 12) / 5;
    g.beginPath(); g.moveTo(x0 + 4, y); g.lineTo(x0 + 16, y); g.stroke();
  }
  g.fillStyle = '#e1e6ee';
  const aim = x0 + 1000 * sx, bar = band * 0.22;
  g.fillRect(aim, cy - band * 0.3 - bar / 2, Math.max(4, 150 * sx), bar);
  g.fillRect(aim, cy + band * 0.3 - bar / 2, Math.max(4, 150 * sx), bar);

  g.textAlign = 'center';
  g.font = '11px system-ui, Segoe UI, sans-serif';
  const step = length >= 9000 ? 2000 : 1000;
  for (let ft = 0; ft <= length; ft += step) {
    const x = x0 + ft * sx;
    g.strokeStyle = col('--line');
    g.beginPath(); g.moveTo(x, bottom); g.lineTo(x, bottom + 6); g.stroke();
    g.fillStyle = col('--muted');
    g.fillText(ft === 0 ? 'THR' : ft / 1000 + 'k', x, bottom + 9);
  }
  const px = x0 + dist * sx, py = Math.max(top + 3, Math.min(bottom - 3, cy + offset * sy));
  g.fillStyle = 'rgba(248,113,113,0.3)';
  g.beginPath(); g.arc(px, py, 13, 0, 7); g.fill();
  g.fillStyle = col('--bad');
  g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath(); g.arc(px, py, 6, 0, 7); g.stroke();
}
export const lateralText = ft => (ft == null ? '--' : Math.abs(ft) < 0.5 ? 'on centreline' : `${num(Math.abs(ft))} ft ${ft > 0 ? 'right' : 'left'}`);
export const rateRating = fpm => (fpm == null ? '' : fpm < 120 ? 'Butter' : fpm < 250 ? 'Smooth' : fpm < 400 ? 'Normal' : fpm < 600 ? 'Firm' : fpm < 800 ? 'Hard' : 'Very hard');
export const rateClass = fpm => (fpm == null ? '' : fpm < 250 ? 'good' : fpm < 600 ? 'warn' : 'bad');

// A labelled value that opens the keypad when tapped.
export function tapValue(text, onTap, cls = '') {
  return h('button', { class: 'tap ' + cls, onclick: onTap }, text);
}
