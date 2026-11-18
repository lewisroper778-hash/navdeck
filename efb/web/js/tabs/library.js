// Charts and documents: your own PDF, JPG and PNG files, shared by the PC and every tablet.
import { S, h, api, set, del, nowIso } from '../core.js';
import { modal, toast, confirmBox } from '../widgets.js';

const COLORS = ['#9a9aa8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c'];
const SECTIONS = ['GND', 'SID', 'STAR', 'APP', 'ENR', 'OTHER'];
const isPdf = path => /\.pdf$/i.test(path);
// ICAO aircraft type -> folder of the bundled NAVDECK QRH and FCOM, shown first in Documents.
const MANUAL_FOLDERS = [
  [/^(BCS1|BCS3|A22\d)/, 'Airbus A220'], [/^(A318|A319|A320|A321|A19N|A20N|A21N)/, 'Airbus A320 family'],
  [/^A33/, 'Airbus A330'], [/^A34/, 'Airbus A340'], [/^A35/, 'Airbus A350'],
  [/^(B73|B37M|B38M|B39M|B3XM)/, 'Boeing 737'], [/^B75/, 'Boeing 757'], [/^B76/, 'Boeing 767'], [/^B77/, 'Boeing 777'], [/^B78/, 'Boeing 787'],
  [/^(A30B|A306|A310|A3ST)/, 'Airbus A300 and A310'], [/^A38/, 'Airbus A380'], [/^B74/, 'Boeing 747'], [/^MD11/, 'McDonnell Douglas MD-11'],
  [/^MD8/, 'McDonnell Douglas MD-80'], [/^(E17|E75|E19|E29)/, 'Embraer E-Jets'], [/^CRJ/, 'Bombardier CRJ'], [/^AT[4-7]/, 'ATR 42 and 72'],
  [/^DH8/, 'De Havilland Dash 8-400'], [/^(B46|RJ)/, 'BAe 146'],
];
const manualFolder = type => { const t = String(type || '').toUpperCase().trim(); return (MANUAL_FOLDERS.find(([re]) => re.test(t)) || [])[1]; };
const baseName = path => path.split('/').pop().replace(/\.(pdf|png|jpe?g)$/i, '');

function makeLibrary(kind) {
  const isCharts = kind === 'charts';
  const st = { files: [], open: null, page: 1, pages: 1, zoom: 1, draw: false, pdf: null, filter: '', closed: {}, task: null, saveTimer: null };
  let side, list, viewer, stage, bar, pagebar, pageEl, inkCanvas;
  const key = path => kind + ':' + path;
  const lib = () => S.library;
  const fileUrl = path => `/lib/${kind}/` + path.split('/').map(encodeURIComponent).join('/');
  const inkKey = () => key(st.open.path) + '#' + st.page;

  async function reload() {
    try { st.files = await api('/api/lib/list?kind=' + kind); } catch { st.files = []; }
    renderSide();
  }

  // ------------------------------------------------------------ side list
  function groups() {
    const f = S.flight;
    const map = new Map();
    for (const file of st.files) {
      if (st.filter && !file.path.toLowerCase().includes(st.filter)) continue;
      const parts = file.path.split('/');
      const group = parts.length > 1 ? parts[0] : (isCharts ? 'GENERAL' : 'General');
      const sub = isCharts ? (parts.length > 2 ? parts[1] : 'OTHER') : '';
      if (!map.has(group)) map.set(group, new Map());
      if (!map.get(group).has(sub)) map.get(group).set(sub, []);
      map.get(group).get(sub).push(file);
    }
    const flightAirports = isCharts ? [f.dep, f.arr, f.diversion?.to, f.altn].filter(Boolean) : [manualFolder(f.type)].filter(Boolean);
    const names = [...map.keys()].sort((a, b) => {
      const ia = flightAirports.indexOf(a), ib = flightAirports.indexOf(b);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.localeCompare(b);
    });
    return names.map(name => ({ name, onFlight: flightAirports.includes(name), subs: [...map.get(name).entries()].sort((a, b) => SECTIONS.indexOf(a[0]) - SECTIONS.indexOf(b[0])) }));
  }

  function cycleColor(k) {
    const cur = lib().colors[k] || COLORS[0];
    set('library', ['colors', k], COLORS[(COLORS.indexOf(cur) + 1) % COLORS.length]);
  }

  function item(file) {
    const k = key(file.path), pinned = !!lib().pins[k];
    return h('div', { class: 'lib-item' + (st.open?.path === file.path ? ' active' : ''), onclick: () => open(file) },
      h('span', { class: 'swatch', title: 'Change colour', style: { width: '10px', height: '10px', borderRadius: '50%', background: lib().colors[k] || 'var(--line)', flex: 'none' }, onclick: e => { e.stopPropagation(); cycleColor(k); } }),
      h('span', { class: 'name' }, baseName(file.path)),
      h('button', { class: 'pin' + (pinned ? ' on' : ''), 'aria-label': 'Pin', onclick: e => { e.stopPropagation(); pinned ? del('library', ['pins', k]) : set('library', ['pins', k], true); } }, '★'));
  }

  function renderSide() {
    if (!list) return;
    const out = [];
    const byPath = new Map(st.files.map(f => [f.path, f]));
    if (!isCharts) {
      const recent = Object.entries(lib().last).filter(([k]) => k.startsWith(kind + ':') && byPath.has(k.slice(kind.length + 1)))
        .sort((a, b) => (a[1].time < b[1].time ? 1 : -1)).slice(0, 3);
      if (recent.length && !st.filter) out.push(h('div', { class: 'lib-group' }, h('div', { class: 'lib-sub', style: { paddingLeft: '8px' } }, 'Continue reading'),
        recent.map(([k, v]) => { const file = byPath.get(k.slice(kind.length + 1)); return h('div', { class: 'lib-item', style: { paddingLeft: '12px' }, onclick: () => open(file) }, h('span', { class: 'name' }, baseName(file.path)), h('small', { class: 'muted' }, 'p. ' + v.page)); })));
    }
    const pinned = st.files.filter(f => lib().pins[key(f.path)] && (!st.filter || f.path.toLowerCase().includes(st.filter)));
    if (pinned.length) out.push(h('div', { class: 'lib-group' }, h('div', { class: 'lib-sub', style: { paddingLeft: '8px' } }, 'Pinned'), pinned.map(f => { const el = item(f); el.style.paddingLeft = '12px'; return el; })));
    for (const g of groups()) {
      const gk = key('@' + g.name), shut = st.closed[g.name];
      out.push(h('div', { class: 'lib-group' },
        h('button', { onclick: () => { st.closed[g.name] = !shut; renderSide(); } },
          h('span', { class: 'swatch', title: 'Change colour', style: { background: lib().colors[gk] || COLORS[0] }, onclick: e => { e.stopPropagation(); cycleColor(gk); } }),
          h('span', { style: { flex: '1' } }, g.name), g.onFlight && h('span', { class: 'tag accent' }, 'This flight'), h('span', { class: 'muted' }, shut ? '▸' : '▾')),
        !shut && g.subs.map(([sub, files]) => [sub && h('div', { class: 'lib-sub' }, sub), files.sort((a, b) => a.path.localeCompare(b.path)).map(item)])));
    }
    if (!out.length) out.push(h('div', { class: 'empty' }, st.filter ? 'Nothing matches.' : isCharts
      ? 'No charts yet. Upload your own PDF, JPG or PNG charts and sort them by airport and section.'
      : 'No documents yet. Upload your manuals and checklists (FCOM, QRH, AFM) as PDF files.'));
    list.replaceChildren(...out);
  }

  // ------------------------------------------------------------ upload
  async function upload() {
    const f = S.flight;
    const folders = [...new Set(st.files.map(x => x.path.split('/')[0]).filter((x, i, a) => x && a))];
    const group = h('input', { class: 'input', type: 'text', list: 'lib-folders', autocapitalize: isCharts ? 'characters' : 'words', value: isCharts ? (f.dep || '') : (folders[0] || 'Manuals'), placeholder: isCharts ? 'Airport ICAO, for example EGLL' : 'Folder name' });
    const section = h('select', { class: 'input' }, SECTIONS.map(s => h('option', null, s)));
    const files = h('input', { class: 'input', type: 'file', multiple: true, accept: isCharts ? '.pdf,.png,.jpg,.jpeg,application/pdf,image/*' : '.pdf,.png,.jpg,.jpeg,application/pdf' });
    const warn = h('div', { class: 'warn-text' });
    const ok = await modal({
      title: isCharts ? 'Add charts' : 'Add documents',
      body: h('div', { class: 'stack' },
        h('datalist', { id: 'lib-folders' }, folders.map(x => h('option', { value: x }))),
        h('label', { class: 'field' }, h('span', null, isCharts ? 'Airport' : 'Folder'), group),
        isCharts && h('label', { class: 'field' }, h('span', null, 'Section'), section),
        h('label', { class: 'field' }, h('span', null, 'Files (PDF, JPG, PNG)'), files), warn),
      buttons: [{ label: 'Cancel', value: false }, { label: 'Upload', primary: true, validate: () => { if (!files.files.length) { warn.textContent = 'Choose at least one file.'; return false; } if (!group.value.trim()) { warn.textContent = isCharts ? 'Enter the airport.' : 'Enter a folder name.'; return false; } return true; } }],
    });
    if (!ok) return;
    const clean = s => s.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const g = isCharts ? clean(group.value).toUpperCase() : clean(group.value);
    let done = 0;
    for (const file of files.files) {
      const path = isCharts ? `${g}/${section.value}/${clean(file.name)}` : `${g}/${clean(file.name)}`;
      try {
        await api(`/api/lib/file?kind=${kind}&path=${encodeURIComponent(path)}`, { method: 'PUT', body: file, raw: true });
        done++;
      } catch (e) { toast(`${file.name}: ${e.message}`, 'bad', 'Upload failed'); }
    }
    if (done) toast(`${done} file${done > 1 ? 's' : ''} added. They are available on every device.`, 'good', 'Library updated');
    await reload();
  }

  // ------------------------------------------------------------ viewer
  async function open(file) {
    st.open = file;
    st.zoom = 1;
    st.pdf = null;
    st.pages = 1;
    st.page = (!isCharts && lib().last[key(file.path)]?.page) || 1;
    renderSide();
    stage.replaceChildren(h('div', { class: 'empty' }, 'Opening…'));
    renderBar();
    if (isPdf(file.path) && window.pdfjsLib) {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        // Range requests: only the pages you look at are downloaded, so big manuals open at once.
        st.pdf = await window.pdfjsLib.getDocument({ url: fileUrl(file.path), disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 }).promise;
        st.pages = st.pdf.numPages;
        st.page = Math.min(st.page, st.pages);
      } catch (e) { st.pdf = null; }
    }
    await renderPage();
  }

  async function renderPage() {
    if (!st.open) return;
    const file = st.open;
    renderBar();
    stage.classList.toggle('night', !!lib().night?.[kind]);
    if (isPdf(file.path) && !st.pdf) {      // no PDF engine available: use the browser's own viewer
      stage.replaceChildren(h('iframe', { src: fileUrl(file.path) + '#page=' + st.page, title: baseName(file.path) }));
      pageEl = inkCanvas = null;
      return;
    }
    inkCanvas = h('canvas', { class: 'ink' });
    const fit = Math.max(200, stage.clientWidth - 24);
    if (st.pdf) {
      const page = await st.pdf.getPage(st.page);
      if (st.open !== file) return;
      const base = page.getViewport({ scale: 1 });
      const cssW = Math.min(fit, 1400) * st.zoom, ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: cssW / base.width * ratio });
      const canvas = h('canvas', { class: 'pdf', width: Math.floor(vp.width), height: Math.floor(vp.height), style: { width: cssW + 'px', height: (cssW * base.height / base.width) + 'px' } });
      pageEl = h('div', { class: 'lib-page' + (st.draw ? ' drawing' : '') }, canvas, inkCanvas);
      stage.replaceChildren(pageEl);
      if (st.task) { try { st.task.cancel(); } catch { /* finished */ } }
      st.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      try { await st.task.promise; } catch { return; }
      setupInk();
      if (!isCharts) rememberPage();
    } else {
      const img = h('img', { src: fileUrl(file.path), alt: baseName(file.path), style: { width: Math.min(fit, 1600) * st.zoom + 'px', height: 'auto', display: 'block' } });
      pageEl = h('div', { class: 'lib-page' + (st.draw ? ' drawing' : '') }, img, inkCanvas);
      stage.replaceChildren(pageEl);
      img.addEventListener('load', setupInk);
    }
  }

  function rememberPage() {
    clearTimeout(st.saveTimer);
    const k = key(st.open.path), page = st.page;
    st.saveTimer = setTimeout(() => set('library', ['last', k], { page, time: nowIso() }), 1200);
  }

  // ------------------------------------------------------------ drawing
  function strokes() { return lib().ink[inkKey()] || []; }
  function drawInk() {
    if (!inkCanvas || !pageEl) return;
    const r = pageEl.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    inkCanvas.width = Math.max(1, Math.round(r.width * ratio));
    inkCanvas.height = Math.max(1, Math.round(r.height * ratio));
    const g = inkCanvas.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of strokes()) {
      g.strokeStyle = s.c; g.lineWidth = s.w * ratio;
      g.beginPath();
      for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i] * inkCanvas.width, y = s.p[i + 1] * inkCanvas.height;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  function setupInk() {
    drawInk();
    let cur = null;
    const pos = e => { const r = inkCanvas.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]; };
    inkCanvas.style.touchAction = 'none';
    inkCanvas.onpointerdown = e => { if (!st.draw) return; cur = { c: '#e11d48', w: 2.5, p: pos(e) }; inkCanvas.setPointerCapture(e.pointerId); e.preventDefault(); };
    inkCanvas.onpointermove = e => {
      if (!cur) return;
      const [x, y] = pos(e), n = cur.p.length, g = inkCanvas.getContext('2d'), ratio = inkCanvas.width / inkCanvas.getBoundingClientRect().width;
      g.strokeStyle = cur.c; g.lineWidth = cur.w * ratio; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cur.p[n - 2] * inkCanvas.width, cur.p[n - 1] * inkCanvas.height); g.lineTo(x * inkCanvas.width, y * inkCanvas.height); g.stroke();
      cur.p.push(x, y);
    };
    inkCanvas.onpointerup = inkCanvas.onpointercancel = () => {
      if (!cur) return;
      if (cur.p.length >= 4) set('library', ['ink', inkKey()], [...strokes(), cur]);
      cur = null;
    };
  }

  // ------------------------------------------------------------ toolbar and page bar
  async function contents() {
    let outline = null;
    try { outline = await st.pdf.getOutline(); } catch { /* none */ }
    if (!outline?.length) { toast('This PDF has no table of contents.'); return; }
    const flat = [];
    const walk = (items, depth) => items.forEach(it => { flat.push({ it, depth }); if (it.items?.length && depth < 2) walk(it.items, depth + 1); });
    walk(outline, 0);
    modal({
      title: 'Contents',
      body: h('div', { class: 'outline' }, flat.slice(0, 400).map(({ it, depth }) => h('button', { style: { paddingLeft: 8 + depth * 18 + 'px' } }, it.title))),
      onOpen: (box, close) => box.querySelectorAll('.outline button').forEach((b, i) => b.addEventListener('click', async () => {
        try {
          let dest = flat[i].it.dest;
          if (typeof dest === 'string') dest = await st.pdf.getDestination(dest);
          const index = await st.pdf.getPageIndex(dest[0]);
          close(null);
          goto(index + 1);
        } catch { toast('That entry could not be opened.'); }
      })),
    });
  }
  function goto(page) {
    const p = Math.max(1, Math.min(st.pages, page));
    if (p === st.page) return;
    st.page = p;
    renderPage();
  }
  async function remove() {
    if (!(await confirmBox('Delete file?', `${baseName(st.open.path)} will be removed from the library on every device.`, 'Delete', true))) return;
    await api(`/api/lib/file?kind=${kind}&path=${encodeURIComponent(st.open.path)}`, { method: 'DELETE' });
    st.open = null;
    stage.replaceChildren(placeholder());
    renderBar();
    reload();
  }
  const placeholder = () => h('div', { class: 'empty' }, isCharts ? 'Choose a chart on the left.' : 'Choose a document on the left.');

  function renderBar() {
    if (!bar) return;
    const f = st.open;
    if (!f) { bar.replaceChildren(h('span', { class: 'title muted' }, isCharts ? 'Charts' : 'Documents')); pagebar.style.display = 'none'; return; }
    const multi = st.pdf && st.pages > 1, night = !!lib().night?.[kind];
    const canDraw = !isPdf(f.path) || !!st.pdf;
    const pagePins = lib().pagePins[key(f.path)] || [];
    const pinnedPage = pagePins.includes(st.page);
    const b = (label, fn, on, aria) => h('button', { class: 'btn small' + (on ? ' primary' : ''), onclick: fn, 'aria-label': aria || label }, label);
    bar.replaceChildren(
      h('span', { class: 'title' }, baseName(f.path)),
      multi && b('◀', () => goto(st.page - 1), false, 'Previous page'),
      multi && h('span', { class: 'mono' }, `${st.page} / ${st.pages}`),
      multi && b('▶', () => goto(st.page + 1), false, 'Next page'),
      canDraw && b('−', () => { st.zoom = Math.max(0.5, st.zoom - 0.25); renderPage(); }, false, 'Zoom out'),
      canDraw && b('+', () => { st.zoom = Math.min(4, st.zoom + 0.25); renderPage(); }, false, 'Zoom in'),
      canDraw && b('Draw', () => { st.draw = !st.draw; pageEl?.classList.toggle('drawing', st.draw); renderBar(); }, st.draw),
      canDraw && strokes().length > 0 && b('Erase', () => del('library', ['ink', inkKey()])),
      canDraw && b('Night', () => set('library', ['night', kind], !night), night),
      st.pdf && b(pinnedPage ? 'Unpin page' : 'Pin page', () => set('library', ['pagePins', key(f.path)], pinnedPage ? pagePins.filter(p => p !== st.page) : [...pagePins, st.page].sort((a, c) => a - c)), pinnedPage),
      st.pdf && b('Contents', contents),
      b('Delete', remove));
    pagebar.style.display = multi ? 'flex' : 'none';
    if (multi) {
      const slider = h('input', { type: 'range', min: 1, max: st.pages, value: st.page, 'aria-label': 'Page' });
      const label = h('span', { class: 'mono' }, `Page ${st.page}`);
      slider.addEventListener('input', () => { label.textContent = 'Page ' + slider.value; });
      slider.addEventListener('change', () => goto(+slider.value));
      pagebar.replaceChildren(label, slider, pagePins.map(p => h('button', { class: 'btn small', onclick: () => goto(p) }, '★ ' + p)));
    }
  }

  return {
    flush: true,
    deps: ['library', 'flight'],
    mount(root) {
      const filter = h('input', { class: 'input', type: 'search', placeholder: 'Search', style: { flex: '1', minWidth: '90px' } });
      filter.addEventListener('input', () => { st.filter = filter.value.trim().toLowerCase(); renderSide(); });
      list = h('div', { class: 'lib-list' });
      side = h('div', { class: 'lib-side' }, h('div', { class: 'tools' }, h('button', { class: 'btn small primary', onclick: upload }, 'Add files'), filter), list);
      bar = h('div', { class: 'lib-bar' });
      stage = h('div', { class: 'lib-stage' }, placeholder());
      pagebar = h('div', { class: 'pagebar', style: { display: 'none' } });
      viewer = h('div', { class: 'lib-view' }, bar, stage, pagebar);
      root.append(h('div', { class: 'lib' }, side, viewer));
      renderBar();
      reload().then(() => { if (st.open && st.files.some(f => f.path === st.open.path)) open(st.open); else st.open = null; });
    },
    update(doc) {
      renderSide();
      if (doc === 'library' && st.open) { stage.classList.toggle('night', !!lib().night?.[kind]); drawInk(); renderBar(); }
    },
    unmount() { list = null; bar = null; },
  };
}

export const docs = makeLibrary('docs');
