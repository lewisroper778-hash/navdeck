// Live: pilots online on the VATSIM network, on a map and in a list. Friends are kept in Settings.
import { S, h, api, setS, num, fmtT, fmtAlt } from '../core.js';
import { toast } from '../widgets.js';

const REFRESH_MS = 30000;
const MAX_ROWS = 250, MAX_PLANES = 450;
let data = null, filter = 'all', query = '', timer = null, map = null, layer = null, canvasRenderer = null;
let listEl, headEl, mapEl, lastFit = '';

const friends = () => (S.settings.vatsimFriends || []).map(x => String(x).toUpperCase());
const isFriend = p => { const f = friends(); return f.includes(String(p.cid)) || f.includes(p.callsign.toUpperCase()); };
const isMe = p => S.settings.vatsimCid && String(p.cid) === String(S.settings.vatsimCid);
const flightAirports = () => [S.flight.dep, S.flight.arr, S.flight.altn, S.flight.diversion?.to].filter(Boolean).map(x => x.toUpperCase());

function filtered() {
  if (!data) return [];
  const q = query.trim().toUpperCase(), apts = flightAirports();
  let list = data.pilots;
  if (filter === 'friends') list = list.filter(p => isFriend(p) || isMe(p));
  else if (filter === 'airports') list = list.filter(p => apts.includes((p.dep || '').toUpperCase()) || apts.includes((p.arr || '').toUpperCase()));
  if (q) list = list.filter(p => [p.callsign, p.dep, p.arr, p.aircraft, p.name, String(p.cid)].some(v => (v || '').toUpperCase().includes(q)));
  return [...list].sort((a, b) => (isMe(b) - isMe(a)) || (isFriend(b) - isFriend(a)) || a.callsign.localeCompare(b.callsign));
}

async function toggleFriend(p) {
  const list = S.settings.vatsimFriends || [];
  const key = String(p.cid);
  const on = isFriend(p);
  await setS(['vatsimFriends'], on ? list.filter(x => String(x).toUpperCase() !== key && String(x).toUpperCase() !== p.callsign.toUpperCase()) : [...list, key]);
  toast(`${p.callsign} ${on ? 'removed from' : 'added to'} your friends.`, 'good');
}

// ---------------------------------------------------------------- data
async function load(quiet) {
  try {
    data = await api('/api/vatsim');
    renderAll();
  } catch (e) {
    if (!quiet || !data) {
      headEl.replaceChildren(h('span', { class: 'warn-text' }, 'VATSIM data could not be loaded: ' + e.message));
      if (!data) listEl.replaceChildren(h('div', { class: 'empty' }, 'The PC running NAVDECK EFB needs an internet connection for live VATSIM traffic.'));
    }
  }
}

// ---------------------------------------------------------------- map
function planeIcon(p) {
  const color = isMe(p) ? '#fbbf24' : isFriend(p) ? '#c4b5fd' : '#9a9aa8';
  const size = isMe(p) || isFriend(p) ? 26 : 18;
  return window.L.divIcon({
    className: 'plane-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${p.hdg || 0}deg)"><path d="M12 2l1.6 6.6L21 13v2l-7.3-2.2-.5 5.3 2.3 1.7V21L12 20l-3.5 1v-1.2l2.3-1.7-.5-5.3L3 15v-2l7.4-4.4z" fill="${color}" stroke="#141418" stroke-width="1"/></svg>`,
  });
}

function popup(p) {
  const el = h('div', { class: 'live-pop' },
    h('b', null, p.callsign), ' ', p.aircraft ? h('span', { class: 'muted' }, p.aircraft) : null,
    h('div', null, (p.dep || '----') + ' → ' + (p.arr || '----')),
    h('div', { class: 'muted' }, `${fmtAlt(p.alt)}  ·  ${num(p.gs)} kt`),
    p.name && h('div', { class: 'muted' }, p.name),
    h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => toggleFriend(p) }, isFriend(p) ? 'Remove friend' : 'Add friend'));
  return el;
}

function ensureMap() {
  if (map || !window.L || !mapEl) return;
  const L = window.L;
  map = L.map(mapEl, { worldCopyJump: true, zoomControl: true, attributionControl: true, preferCanvas: false }).setView([50, 5], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12, subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors | Traffic: VATSIM',
  }).addTo(map);
  canvasRenderer = L.canvas({ padding: 0.3 });
  layer = L.layerGroup().addTo(map);
}

function drawMap(list) {
  if (!window.L) return;
  ensureMap();
  if (!map) return;
  const L = window.L;
  layer.clearLayers();
  // Many aircraft: light dots drawn on a canvas. Fewer: rotated aircraft symbols.
  const planes = list.length <= MAX_PLANES;
  for (const p of list) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const marker = planes || isFriend(p) || isMe(p)
      ? L.marker([p.lat, p.lon], { icon: planeIcon(p), title: p.callsign, keyboard: false })
      : L.circleMarker([p.lat, p.lon], { renderer: canvasRenderer, radius: 2.5, weight: 0, fillOpacity: 0.85, fillColor: '#a78bfa' });
    marker.bindPopup(() => popup(p));
    layer.addLayer(marker);
  }
  // Zoom to the selection when it changes (not on every refresh).
  const key = filter + '|' + query;
  if (key !== lastFit && list.length && list.length < 400) {
    lastFit = key;
    const pts = list.filter(p => Number.isFinite(p.lat)).map(p => [p.lat, p.lon]);
    if (pts.length === 1) map.setView(pts[0], 7);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 8 });
  } else if (key !== lastFit) lastFit = key;
}

// ---------------------------------------------------------------- list
function renderAll() {
  if (!headEl) return;
  const list = filtered();
  const fr = data.pilots.filter(isFriend).length;
  headEl.replaceChildren(
    h('span', null, h('b', null, num(data.pilots.length)), ' pilots online'),
    h('span', { class: 'muted' }, `  ·  ${fr} friend${fr === 1 ? '' : 's'} flying  ·  updated ${fmtT(data.updated || data.fetched)}z`),
    list.length !== data.pilots.length && h('span', { class: 'tag accent', style: { marginLeft: '8px' } }, `${num(list.length)} shown`));
  const rows = list.slice(0, MAX_ROWS).map(p => h('tr', { class: isMe(p) ? 'next' : '', onclick: () => {
    if (map && Number.isFinite(p.lat)) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 7)); }
  } },
    h('td', null, h('b', null, p.callsign), isMe(p) ? h('span', { class: 'tag warn', style: { marginLeft: '6px' } }, 'You') : null),
    h('td', null, p.aircraft || ''),
    h('td', { class: 'mono' }, `${p.dep || '----'} → ${p.arr || '----'}`),
    h('td', { class: 'num' }, fmtAlt(p.alt)),
    h('td', { class: 'num' }, num(p.gs)),
    h('td', { style: { width: '44px' } }, h('button', {
      class: 'pin' + (isFriend(p) ? ' on' : ''), 'aria-label': isFriend(p) ? 'Remove friend' : 'Add friend',
      style: { background: 'none', border: 0, cursor: 'pointer', fontSize: '18px', color: isFriend(p) ? 'var(--accent)' : 'var(--muted)' },
      onclick: e => { e.stopPropagation(); toggleFriend(p); },
    }, isFriend(p) ? '★' : '☆'))));
  listEl.replaceChildren(list.length
    ? h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Callsign'), h('th', null, 'Aircraft'), h('th', null, 'Route'), h('th', { class: 'num' }, 'Altitude'), h('th', { class: 'num' }, 'GS'), h('th', null, ''))), h('tbody', null, rows),
      list.length > MAX_ROWS && h('caption', { style: { captionSide: 'bottom', padding: '8px', color: 'var(--muted)' } }, `Showing the first ${MAX_ROWS}. Search to narrow the list.`))
    : h('div', { class: 'empty' }, filter === 'friends' ? 'None of your friends are flying on VATSIM right now. Tap the star next to a pilot to add them.' : filter === 'airports' ? 'No VATSIM traffic to or from the airports of your flight.' : 'No pilots match.'));
  drawMap(list);
}

export default {
  flush: true,
  deps: ['settings', 'flight'],
  mount(root) {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Callsign, airport, aircraft or pilot', value: query, style: { maxWidth: '300px' } });
    let debounce = null;
    search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { query = search.value; if (data) renderAll(); }, 200); });
    const seg = h('div', { class: 'seg' });
    const drawSeg = () => seg.replaceChildren(...[['all', 'Everyone'], ['airports', 'My airports'], ['friends', 'Friends']].map(([v, label]) =>
      h('button', { class: filter === v ? 'on' : '', onclick: () => { filter = v; drawSeg(); if (data) renderAll(); } }, label)));
    drawSeg();
    headEl = h('div', { class: 'row', style: { fontSize: '14px' } }, h('span', { class: 'muted' }, 'Loading VATSIM traffic…'));
    listEl = h('div', { class: 'live-list' });
    mapEl = h('div', { class: 'live-map' }, !window.L && h('div', { class: 'empty' }, 'The map is not available on this device. The list shows everyone online.'));
    root.append(h('div', { class: 'vlive' },
      h('div', { class: 'live-top' }, h('h2', null, 'Live'), h('span', { class: 'tag' }, 'VATSIM network'), seg, search, h('div', { class: 'spacer' }), headEl),
      h('div', { class: 'live-body' }, mapEl, listEl)));
    map = null; lastFit = '';
    if (data) renderAll();
    load(false);
    timer = setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
  },
  update() { if (data) renderAll(); },
  unmount() {
    clearInterval(timer);
    if (map) { map.remove(); map = null; }
    headEl = listEl = mapEl = null;
  },
};
