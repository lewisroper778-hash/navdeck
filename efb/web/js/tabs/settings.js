// Settings: sorted by topic, searchable. Units, themes, airline profiles, tabs, SimBrief, GSX and devices.
import { S, h, setS, uid } from '../core.js';
import { modal, confirmBox, toast } from '../widgets.js';
import { activeTabs } from '../app.js';

let topic = 'general', query = '';
const PROFILE_COLORS = ['#a78bfa', '#7c3aed', '#2563eb', '#00c8eb', '#e11d48', '#f59e0b', '#16a34a', '#0f766e', '#ea580c', '#475569'];

const seg = (path, options, current) => h('div', { class: 'seg' }, options.map(([v, label]) => h('button', { class: current === v ? 'on' : '', onclick: () => setS(path, v) }, label)));
const toggle = (path, value, label) => h('button', { class: 'switch' + (value ? ' on' : ''), 'aria-label': label, onclick: () => setS(path, !value) });
const text = (path, value, placeholder = '', type = 'text') => {
  const el = h('input', { class: 'input', type, value: value ?? '', placeholder, style: { minWidth: '220px' } });
  el.addEventListener('change', () => setS(path, type === 'number' ? (parseFloat(el.value) || 0) : el.value.trim()));
  return el;
};
const row = (title, hint, control) => ({ title, hint, control });

async function editProfile(existing) {
  const p = existing ? { ...existing } : { id: uid(), name: '', icao: '', color: PROFILE_COLORS[0], logo: '' };
  const name = h('input', { class: 'input', type: 'text', value: p.name, placeholder: 'Airline name' });
  const icao = h('input', { class: 'input', type: 'text', value: p.icao, placeholder: 'ICAO code, for example BAW', autocapitalize: 'characters', maxlength: 4 });
  const swatches = h('div', { class: 'swatches' });
  const drawSwatches = () => swatches.replaceChildren(...PROFILE_COLORS.map(c => h('button', { class: p.color === c ? 'on' : '', style: { background: c }, 'aria-label': c, onclick: () => { p.color = c; drawSwatches(); } })));
  drawSwatches();
  const preview = h('img', { class: 'sig-img', style: { maxWidth: '140px', display: p.logo ? 'block' : 'none' }, src: p.logo || '' });
  const file = h('input', { class: 'input', type: 'file', accept: 'image/*' });
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {            // shrink the logo so it stays small in the settings file
      const scale = Math.min(1, 320 / img.width, 160 / img.height);
      const c = h('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      p.logo = c.toDataURL('image/png');
      preview.src = p.logo;
      preview.style.display = 'block';
    };
    img.src = URL.createObjectURL(f);
  });
  const ok = await modal({
    title: existing ? 'Edit airline profile' : 'New airline profile',
    body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'ICAO code (profile is chosen automatically for flights of this airline)'), icao),
      h('div', { class: 'field' }, h('span', null, 'Colour'), swatches), h('label', { class: 'field' }, h('span', null, 'Logo'), file), preview),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Save profile', value: true, primary: true }],
  });
  if (!ok || !name.value.trim()) return;
  p.name = name.value.trim();
  p.icao = icao.value.trim().toUpperCase();
  const list = [...(S.settings.profiles || [])];
  const i = list.findIndex(x => x.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  await setS(['profiles'], list);
}

function profilesControl() {
  const list = S.settings.profiles || [];
  return h('div', { class: 'stack', style: { minWidth: '280px' } },
    list.map(p => h('div', { class: 'row' },
      h('span', { style: { width: '18px', height: '18px', borderRadius: '5px', background: p.color, flex: 'none' } }),
      h('b', { style: { flex: '1' } }, p.name, p.icao ? h('span', { class: 'muted' }, '  ' + p.icao) : null),
      h('button', { class: 'btn small' + (S.settings.activeProfile === p.id ? ' primary' : ''), onclick: () => setS(['activeProfile'], S.settings.activeProfile === p.id ? '' : p.id) }, S.settings.activeProfile === p.id ? 'Default' : 'Use'),
      h('button', { class: 'btn small', onclick: () => editProfile(p) }, 'Edit'),
      h('button', { class: 'btn small danger', 'aria-label': 'Delete profile', onclick: async () => { if (await confirmBox('Delete profile?', p.name, 'Delete', true)) setS(['profiles'], list.filter(x => x.id !== p.id)); } }, '✕'))),
    h('div', null, h('button', { class: 'btn small', onclick: () => editProfile(null) }, 'Add airline profile')));
}

function tabsControl() {
  const tabs = activeTabs();
  const save = next => setS(['tabs'], next.map(t => ({ id: t.id, on: t.on })));
  const move = (i, d) => { const next = [...tabs]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; save(next); };
  return h('div', { class: 'stack', style: { minWidth: '280px', gap: '6px' } }, tabs.map((t, i) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
    h('b', { style: { flex: '1' } }, t.label),
    h('button', { class: 'btn small', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '▲'),
    h('button', { class: 'btn small', 'aria-label': 'Move down', disabled: i === tabs.length - 1, onclick: () => move(i, 1) }, '▼'),
    h('button', { class: 'switch' + (t.on ? ' on' : ''), 'aria-label': 'Show ' + t.label, disabled: t.id === 'settings', onclick: () => { const next = tabs.map(x => ({ ...x })); next[i].on = !next[i].on; save(next); } }))));
}

function delaysControl() {
  const list = S.settings.customDelays || [];
  const add = async () => {
    const code = h('input', { class: 'input', type: 'text', placeholder: 'Code, for example C1', maxlength: 4 });
    const reason = h('input', { class: 'input', type: 'text', placeholder: 'Reason' });
    const ok = await modal({ title: 'Own delay code', body: h('div', { class: 'stack' }, code, reason), buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, primary: true }] });
    if (ok && code.value.trim() && reason.value.trim()) setS(['customDelays'], [...list, { code: code.value.trim().toUpperCase(), text: reason.value.trim() }]);
  };
  return h('div', { class: 'stack', style: { minWidth: '280px', gap: '6px' } },
    list.map((d, i) => h('div', { class: 'row' }, h('span', { class: 'tag warn' }, d.code), h('span', { style: { flex: '1' } }, d.text),
      h('button', { class: 'btn small', 'aria-label': 'Remove', onclick: () => setS(['customDelays'], list.filter((_, j) => j !== i)) }, '✕'))),
    h('div', null, h('button', { class: 'btn small', onclick: add }, 'Add own code')));
}

function devicesControl() {
  const urls = S.info.urls || [];
  return h('div', { class: 'stack', style: { minWidth: '280px', gap: '6px' } },
    urls.length ? urls.map(u => h('div', { class: 'row' }, h('b', { class: 'mono', style: { flex: '1' } }, u),
      h('button', { class: 'btn small', onclick: () => navigator.clipboard?.writeText(u).then(() => toast('Address copied.', 'good')) }, 'Copy')))
      : h('span', { class: 'muted' }, 'Shown when the Windows app is running.'));
}

function topics() {
  const st = S.settings, u = st.units;
  return [
    { id: 'general', label: 'General', rows: [
      row('Day and night mode', 'Automatic switches to day between 07:00 and 19:00.', seg(['theme'], [['night', 'Night'], ['day', 'Day'], ['auto', 'Automatic']], st.theme)),
      row('EFB clock', 'Automatic follows simulator time when it differs from real time.', seg(['clock'], [['auto', 'Automatic'], ['real', 'Real'], ['sim', 'Simulator']], st.clock)),
      row('Pilot in command', 'Used for signatures.', text(['picName'], st.picName, 'Your name')),
      row('Company name', 'Shown on the journey log.', text(['company'], st.company, 'Airline or virtual airline')),
      row('Company e-mail', 'Used by "Send to company".', text(['companyEmail'], st.companyEmail, 'ops@example.com', 'email')),
    ] },
    { id: 'reports', label: 'Journey logs', rows: [
      row('Send journey logs to NAVDECK', 'When you sign and close a flight, its journey log PDF is emailed automatically to inflightreports@navdeck.online. It includes the flight, times, fuel, crew names and signatures.', toggle(['sendReports'], st.sendReports !== false, 'Send journey logs to NAVDECK')),
      row('Waiting to be sent', 'Logs are kept and retried automatically when the PC is offline.', h('span', { class: 'mono' }, String(S.info.outbox ?? 0))),
    ] },
    { id: 'units', label: 'Units', rows: [
      row('Weight and fuel', 'Kilograms or pounds everywhere, including the PDF.', seg(['units', 'weight'], [['kg', 'KG'], ['lb', 'LB']], u.weight)),
      row('Fuel volume', 'Used for uplift.', seg(['units', 'volume'], [['l', 'Litres'], ['usg', 'US gallons']], u.volume)),
      row('Altitude', '', seg(['units', 'alt'], [['ft', 'Feet'], ['m', 'Metres']], u.alt)),
      row('Pressure', '', seg(['units', 'press'], [['hpa', 'hPa'], ['inhg', 'inHg']], u.press)),
    ] },
    { id: 'navlog', label: 'NavLog and fuel', rows: [
      row('SimBrief username', 'Username or pilot ID used by "Load SimBrief plan".', text(['simbriefUser'], st.simbriefUser, 'SimBrief username')),
      row('Automatic fuel checks', 'Records the fuel on board during the flight and reminds you.', toggle(['fuelCheckOn'], st.fuelCheckOn, 'Automatic fuel checks')),
      row('Fuel check interval', '', seg(['fuelCheckMin'], [[30, '30 minutes'], [60, '60 minutes']], st.fuelCheckMin)),
      row('Hide TOC and TOD', 'Hides the SimBrief top of climb and top of descent rows.', toggle(['hideTocTod'], st.hideTocTod, 'Hide TOC and TOD')),
    ] },
    { id: 'occ', label: 'OCC', rows: [
      row('Company messages', 'OCC sends messages as the flight progresses.', toggle(['autoMessages'], st.autoMessages, 'Company messages')),
      row('Own delay codes', 'Offered next to the IATA delay codes.', delaysControl()),
    ] },
    { id: 'vatsim', label: 'VATSIM', rows: [
      row('Your VATSIM CID', 'Highlights your own aircraft in the Live section.', text(['vatsimCid'], st.vatsimCid, 'For example 1234567')),
      row('Friends', 'Tap the star next to a pilot in the Live section to add a friend.', h('span', { class: 'muted' }, `${(st.vatsimFriends || []).length} friend${(st.vatsimFriends || []).length === 1 ? '' : 's'}`)),
      row('Clear friends', '', h('button', { class: 'btn small danger', disabled: !(st.vatsimFriends || []).length, onclick: () => setS(['vatsimFriends'], []) }, 'Clear')),
    ] },
    { id: 'gsx', label: 'GSX', rows: [
      row('GSX remote address', 'IP address of the PC running GSX. 127.0.0.1 is this PC.', text(['gsx', 'host'], st.gsx.host, '127.0.0.1')),
      row('GSX remote port', '', text(['gsx', 'port'], st.gsx.port, '8380', 'number')),
      row('Currency', 'Used for receipts and invoices.', text(['currency'], st.currency, 'EUR')),
      row('Fuel price per kg', 'Used for the automatic fuel receipt.', text(['fuelPrice'], st.fuelPrice, '0.95', 'number')),
    ] },
    { id: 'profiles', label: 'Airline profiles', rows: [
      row('Airline profiles', 'Colours and logo for each airline. The profile is chosen by the ICAO code of the flight.', profilesControl()),
    ] },
    { id: 'tabs', label: 'Tabs', rows: [
      row('Tabs and sections', 'Switch tabs off or move them.', tabsControl()),
    ] },
    { id: 'devices', label: 'Tablets', rows: [
      row('Open on an iPad or tablet', 'On the same Wi-Fi, open one of these addresses in Safari, then use Share and "Add to Home Screen".', devicesControl()),
      row('Version', '', h('span', { class: 'mono muted' }, 'NAVDECK EFB ' + (S.info.version || 'web'))),
    ] },
  ];
}

export default {
  deps: ['settings', 'flight'],
  render(root) {
    const all = topics();
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search settings', value: query, style: { maxWidth: '320px' } });
    const body = h('div', null);
    const nav = h('nav', null);
    const draw = () => {
      const shown = query
        ? [{ label: 'Results', rows: all.flatMap(t => t.rows.filter(r => (r.title + ' ' + r.hint + ' ' + t.label).toLowerCase().includes(query.toLowerCase()))) }]
        : all.filter(t => t.id === topic);
      nav.replaceChildren(...all.map(t => h('button', { class: !query && t.id === topic ? 'on' : '', onclick: () => { topic = t.id; query = ''; search.value = ''; draw(); } }, t.label)));
      body.replaceChildren(...shown.map(t => h('div', { class: 'card' }, h('h3', null, t.label),
        t.rows.length ? t.rows.map(r => h('div', { class: 'setting' }, h('div', { class: 'info' }, h('b', null, r.title), r.hint && h('small', null, r.hint)), h('div', { class: 'control' }, r.control)))
          : h('div', { class: 'empty' }, 'No setting matches.'))));
    };
    search.addEventListener('input', () => { query = search.value.trim(); draw(); });
    root.append(h('div', { class: 'page-head' }, h('h2', null, 'Settings'), h('div', { class: 'spacer' }), search), h('div', { class: 'settings' }, nav, body));
    draw();
  },
};
