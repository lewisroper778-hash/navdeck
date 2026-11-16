// Airline lookup: works out the airline of a flight from its SimBrief airline code, flight number or callsign.
// The list of codes and names is in data/airlines.json (also read by the Windows host for Discord posts).
let list = [];
const byIcao = new Map(), byIata = new Map();

export const airlinesReady = fetch('data/airlines.json').then(r => r.json()).then(rows => {
  list = rows.map(([icao, iata, name]) => ({ icao, iata, name }));
  for (const a of list) {
    byIcao.set(a.icao, a);
    if (a.iata && !byIata.has(a.iata)) byIata.set(a.iata, a);
  }
}).catch(() => { /* no list: only SimBrief codes are used */ });

export const allAirlines = () => list;
export const airlineByIcao = code => byIcao.get(String(code || '').toUpperCase().trim()) || null;

// Returns { icao, iata, name } or null.
export function airlineOf(f) {
  if (!f) return null;
  const own = String(f.airline || '').toUpperCase().trim();
  if (/^[A-Z]{3}$/.test(own)) return byIcao.get(own) || { icao: own, iata: '', name: f.airlineName || '' };
  for (const raw of [f.flightNo, f.callsign]) {
    const s = String(raw || '').toUpperCase().replace(/[\s-]/g, '');
    let m = /^([A-Z]{3})\d/.exec(s);
    if (m && byIcao.has(m[1])) return byIcao.get(m[1]);
    m = /^([A-Z0-9]{2})\d/.exec(s);
    if (m && /[A-Z]/.test(m[1]) && byIata.has(m[1])) return byIata.get(m[1]);
  }
  return null;
}

export const airlineCode = f => airlineOf(f)?.icao || '';
