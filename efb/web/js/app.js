// App shell: navigation, top bar, themes, airline profiles, notifications and automatic company messages.
import { S, on, loadState, connectEvents, h, fmtT, now, usingSimClock, fmtW, fmtAlt, num, stageName, flightTitle, setF, setS, onError, addNotice, nowIso } from './core.js';
import { ALL_TABS, OCC_TEMPLATES } from './data.js';
import { toast, modal } from './widgets.js';
import flight from './tabs/flight.js';
import occ from './tabs/occ.js';
import loads from './tabs/loads.js';
import navlog from './tabs/navlog.js';
import times from './tabs/times.js';
import landing from './tabs/landing.js';
import gsx from './tabs/gsx.js';
import { docs } from './tabs/library.js';
import live from './tabs/live.js';
import report from './tabs/report.js';
import settings from './tabs/settings.js';

const TABS = { flight, occ, loads, navlog, times, landing, gsx, live, docs, report, settings };
const view = document.getElementById('view');
const rail = document.getElementById('rail');
const topbar = document.getElementById('topbar');
let current = null, currentId = '', dirty = false;

// ---------------------------------------------------------------- navigation
export function activeTabs() {
  const saved = S.settings.tabs;
  const order = Array.isArray(saved) ? saved.filter(t => TABS[t.id]) : [];
  for (const t of ALL_TABS) if (!order.some(x => x.id === t.id)) order.push({ id: t.id, on: true });
  return order.map(t => ({ ...ALL_TABS.find(a => a.id === t.id), on: t.on !== false || t.id === 'settings' }));
}

function renderRail() {
  const profile = activeProfile();
  const unread = Object.values(S.flight.occ.messages || {}).filter(m => !m.ack).length;
  rail.replaceChildren(
    h('div', { class: 'brand' }, profile?.logo ? h('img', { class: 'airline', src: profile.logo, alt: '' }) : h('img', { src: 'img/logo.svg', alt: 'NAVDECK' }), profile?.icao || 'NAVDECK'),
    activeTabs().filter(t => t.on).map(t => h('a', { href: '#' + t.id, class: t.id === currentId ? 'active' : '' },
      h('span', { html: `<svg viewBox="0 0 24 24"><path d="${t.icon}"/></svg>` }), t.label,
      t.id === 'occ' && unread > 0 && h('span', { class: 'dot' }, unread))));
}

function go(id) {
  const tabs = activeTabs().filter(t => t.on);
  if (!tabs.some(t => t.id === id)) id = tabs[0].id;
  if (current?.unmount) current.unmount();
  currentId = id;
  current = TABS[id];
  view.replaceChildren();
  view.className = current.flush ? 'flush' : '';
  view.scrollTop = 0;
  if (current.mount) current.mount(view); else current.render(view);
  renderRail();
}

function refresh(doc) {
  if (!current) return;
  if (current.deps && !current.deps.includes(doc)) return;
  const focused = document.activeElement;
  if (focused && view.contains(focused) && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName)) { dirty = true; return; }
  dirty = false;
  if (current.update) { current.update(doc); return; }
  const top = view.scrollTop;
  view.replaceChildren();
  current.render(view);
  view.scrollTop = top;
}
view.addEventListener('focusout', () => setTimeout(() => { if (dirty) refresh('flight'); }, 60));

// ---------------------------------------------------------------- theme and airline profile
export function activeProfile() {
  const list = S.settings.profiles || [];
  return list.find(p => p.id === S.flight.profile)
    || list.find(p => p.icao && S.flight.airline && p.icao.toUpperCase() === S.flight.airline.toUpperCase())
    || list.find(p => p.id === S.settings.activeProfile) || null;
}
function applyTheme() {
  const root = document.documentElement;
  let theme = S.settings.theme;
  if (theme === 'auto') { const hr = new Date().getHours(); theme = hr >= 7 && hr < 19 ? 'day' : 'night'; }
  root.dataset.theme = theme === 'day' ? 'day' : 'night';
  const p = activeProfile();
  if (p?.color) {
    root.dataset.profile = p.id;
    root.style.setProperty('--accent', p.color);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(p.color.slice(i, i + 2), 16));
    root.style.setProperty('--accent-ink', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#04121c' : '#ffffff');
    root.style.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, .16)`);
  } else {
    delete root.dataset.profile;
    ['--accent', '--accent-ink', '--accent-dim'].forEach(v => root.style.removeProperty(v));
  }
}

// ---------------------------------------------------------------- top bar
const clockEl = h('div', { class: 'clock' });
const liveEl = h('div', { class: 'live' });
const simChip = h('span', { class: 'chip' });
const phaseChip = h('span', { class: 'chip plain' });
const bell = h('button', { class: 'icon-btn', 'aria-label': 'Notifications', onclick: showNotices }, '🔔');
const identEl = h('div', { class: 'ident' });
const routeEl = h('div', { class: 'route' });

function buildTopbar() {
  topbar.replaceChildren(identEl, routeEl, phaseChip, h('div', { class: 'spacer' }), liveEl, simChip, clockEl, bell,
    h('button', {
      class: 'icon-btn', 'aria-label': 'Day or night mode',
      onclick: () => setS(['theme'], document.documentElement.dataset.theme === 'day' ? 'night' : 'day'),
    }, '◐'));
}
function renderTopbar() {
  const f = S.flight;
  identEl.textContent = f.callsign || f.flightNo || 'No flight';
  routeEl.textContent = flightTitle(f) + (f.type ? '  ·  ' + f.type : '') + (f.reg ? '  ·  ' + f.reg : '');
  phaseChip.textContent = f.closed ? 'Closed' : f.diversion ? 'Diverting to ' + f.diversion.to : stageName(S.sim.stage);
  renderLive();
}
function renderLive() {
  const s = S.sim;
  simChip.textContent = s.connected ? 'Simulator connected' : s.hostLost ? 'EFB host not reachable' : 'Waiting for simulator';
  simChip.style.color = s.connected ? 'var(--good)' : s.hostLost ? 'var(--bad)' : 'var(--warn)';
  liveEl.replaceChildren(...(s.connected && s.hasPosition ? [
    h('span', null, 'ALT ', h('b', null, fmtAlt(Math.round(s.altFt / 10) * 10))),
    h('span', null, 'GS ', h('b', null, num(s.gsKt) + ' kt')),
    h('span', null, 'FOB ', h('b', null, fmtW(s.fobKg))),
  ] : []));
}
function tickClock() {
  clockEl.replaceChildren(fmtT(now().toISOString(), true) + 'z', usingSimClock() && h('small', null, 'SIM'));
}
function showNotices() {
  bell.querySelector('.dot')?.remove();
  modal({
    title: 'Notifications',
    body: S.notices.length ? h('div', null, S.notices.map(n => h('div', { class: 'notice' },
      h('small', null, fmtT(n.time) + 'z'), h('div', null, h('b', null, n.title || ''), n.title ? '  ' : '', n.text))))
      : h('div', { class: 'empty' }, 'No notifications yet.'),
  });
}

// ---------------------------------------------------------------- automatic company (OCC) messages
const seenMessages = new Set();
let firstPass = true;
function fill(template, f) {
  const specials = (f.load?.specials || []).map(x => x.code);
  const count = {};
  specials.forEach(c => { count[c] = (count[c] || 0) + 1; });
  const map = {
    flightNo: f.flightNo || f.callsign, dep: f.dep, arr: f.arr, blockFuel: fmtW(f.fuel.planRamp),
    ctot: fmtT(f.times.ctot), tsat: fmtT(f.times.tsat), booked: f.load?.booked, seats: f.load?.seats,
    specials: Object.entries(count).map(([c, k]) => k + ' ' + c).join(', ') || 'none',
    edition: f.load?.edition, off: fmtT(f.times.off), on: fmtT(f.times.on), in: fmtT(f.times.in), to: f.diversion?.to,
  };
  return template.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '--');
}
function autoMessages() {
  const f = S.flight;
  if (!S.settings.autoMessages || f.closed || !f.dep) return;
  const have = f.occ.messages || {};
  const want = [];
  want.push(['release', OCC_TEMPLATES.release]);
  if (f.times.ctot || f.times.tsat) want.push(['slot-' + (f.times.ctot || '') + (f.times.tsat || ''), OCC_TEMPLATES.slot]);
  if (f.load) want.push(['pax', OCC_TEMPLATES.pax]);
  if (f.load?.final) want.push(['loadsheet-' + f.load.edition, OCC_TEMPLATES.loadsheet]);
  if (f.times.off) want.push(['airborne', OCC_TEMPLATES.airborne]);
  if (f.times.on) want.push(['landed', OCC_TEMPLATES.landed]);
  if (f.times.in) want.push(['blockin', OCC_TEMPLATES.blockin]);
  (f.goArounds || []).forEach((g, i) => want.push(['goaround-' + i, OCC_TEMPLATES.goaround.replace('{time}', fmtT(g.time))]));
  if (f.diversion) want.push(['diversion', OCC_TEMPLATES.diversion]);
  for (const [key, template] of want) {
    if (have[key]) continue;
    setF(['occ', 'messages', key], { id: key, time: nowIso(), from: 'OCC', text: fill(template, f), ack: null });
  }
}
function announceMessages() {
  for (const [key, m] of Object.entries(S.flight.occ.messages || {})) {
    if (seenMessages.has(key)) continue;
    seenMessages.add(key);
    if (!firstPass && !m.ack && m.from !== 'CREW') addNotice({ title: 'Company message', text: m.text, kind: 'info' });
  }
  firstPass = false;
}

// ---------------------------------------------------------------- reminders when flying without the simulator link
let lastReminderSlot = '';
function fuelCheckReminder() {
  const f = S.flight;
  if (!S.settings.fuelCheckOn || !f.times.off || f.times.on || f.closed) return;
  const last = f.lastFuelCheck || f.times.off;
  const due = Date.parse(last) + S.settings.fuelCheckMin * 60000;
  if (now() < due) return;
  const slot = f.id + '|' + last;
  if (slot === lastReminderSlot) return;
  lastReminderSlot = slot;
  addNotice({ title: 'Fuel check due', text: `Record the fuel on board (every ${S.settings.fuelCheckMin} minutes).`, kind: 'warn' });
}

// ---------------------------------------------------------------- start
async function start() {
  onError(msg => toast(msg, 'bad'));
  on('notify', n => {
    toast(n.text, n.kind || 'info', n.title);
    if (!bell.querySelector('.dot')) bell.append(h('span', { class: 'dot' }, '!'));
  });
  for (let attempt = 0; ; attempt++) {
    try { await loadState(); break; } catch (e) {
      document.getElementById('boot').textContent = 'Waiting for the NAVDECK EFB host…';
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  document.getElementById('boot').classList.add('hidden');
  buildTopbar();
  applyTheme();
  announceMessages();
  connectEvents();

  on('doc', doc => {
    if (doc === 'settings' || doc === 'flight') { applyTheme(); renderRail(); renderTopbar(); }
    if (doc === 'flight') { autoMessages(); announceMessages(); }
    if (doc === 'settings' && !activeTabs().some(t => t.on && t.id === currentId)) go(currentId);
    refresh(doc);
  });
  on('sim', sim => { renderLive(); phaseChip.textContent = S.flight.closed ? 'Closed' : S.flight.diversion ? 'Diverting to ' + S.flight.diversion.to : stageName(sim.stage); if (current?.live) current.live(sim); });
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  renderTopbar();
  autoMessages();
  go(location.hash.slice(1) || 'flight');
  tickClock();
  setInterval(() => { tickClock(); if (current?.tick) current.tick(); }, 1000);
  setInterval(fuelCheckReminder, 20000);
}
start();
