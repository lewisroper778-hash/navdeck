// Safety report types. Each report is opened, completed, then signed and closed; closing posts it to Discord.
// Field kinds: text, num, select, yesno, area. "auto" fills a value from the current flight when the report is opened.

const PHASES = ['Parked', 'Pushback', 'Taxi out', 'Takeoff', 'Initial climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing', 'Taxi in'];
const phaseOf = f => {
  const t = f.times || {};
  if (t.in) return 'Parked';
  if (t.on) return 'Taxi in';
  if (t.off) return 'Cruise';
  if (t.out) return 'Taxi out';
  return '';
};
const lastGa = f => (f.goArounds || []).filter(g => g.kind !== 'touch-and-go').pop();

export const SEVERITIES = [
  ['Low', 'No safety effect, or minor. Reported for awareness.'],
  ['Medium', 'Safety margin reduced. Needs review.'],
  ['High', 'Serious incident or a near miss. Needs urgent review.'],
];

export const OUTCOMES = ['No further action', 'Lessons learned shared with pilots', 'Procedure or briefing change proposed',
  'Maintenance action raised', 'Passed to the safety team for investigation', 'Other'];

export const SAFETY_TYPES = [
  {
    id: 'asr', name: 'Air safety report', short: 'ASR', icon: 'M12 3l9 16H3zM12 10v4M12 17h0',
    hint: 'Any event that affected, or could have affected, the safety of the flight.',
    fields: [
      { k: 'category', label: 'Category', kind: 'select', options: ['Operational', 'ATC', 'Weather', 'Turbulence', 'Ground handling', 'Technical', 'Security', 'Cabin', 'Other'], req: true },
      { k: 'phase', label: 'Phase of flight', kind: 'select', options: PHASES, req: true, auto: phaseOf },
      { k: 'altitude', label: 'Altitude (ft)', kind: 'num' },
      { k: 'location', label: 'Location (airport, waypoint or position)', kind: 'text' },
      { k: 'atcInformed', label: 'ATC informed', kind: 'yesno' },
    ],
  },
  {
    id: 'birdstrike', name: 'Bird strike', short: 'BIRD', icon: 'M3 12c4-4 7-4 9 0 2-4 5-4 9 0M12 12v6',
    hint: 'A bird or wildlife strike, or a suspected one.',
    fields: [
      { k: 'phase', label: 'Phase of flight', kind: 'select', options: PHASES, req: true, auto: phaseOf },
      { k: 'altitude', label: 'Altitude (ft)', kind: 'num', req: true },
      { k: 'speed', label: 'Speed (kt)', kind: 'num' },
      { k: 'birds', label: 'Number of birds', kind: 'select', options: ['1', '2 to 10', '11 to 100', 'More than 100', 'Unknown'], req: true },
      { k: 'size', label: 'Bird size', kind: 'select', options: ['Small', 'Medium', 'Large', 'Unknown'] },
      { k: 'parts', label: 'Parts struck', kind: 'text', req: true, placeholder: 'Radome, windshield, engine 1...' },
      { k: 'engine', label: 'Engine ingestion', kind: 'yesno' },
      { k: 'effect', label: 'Effect on the flight', kind: 'select', options: ['None', 'Rejected takeoff', 'Return to departure', 'Diversion', 'Precautionary landing', 'Other'], req: true },
    ],
  },
  {
    id: 'tcas', name: 'TCAS RA / airprox', short: 'TCAS', icon: 'M12 4l3 6h-6zM12 20l-3-6h6zM4 12h4M16 12h4',
    hint: 'A TCAS resolution advisory, or traffic closer than expected.',
    fields: [
      { k: 'phase', label: 'Phase of flight', kind: 'select', options: PHASES, req: true, auto: phaseOf },
      { k: 'altitude', label: 'Altitude (ft)', kind: 'num', req: true },
      { k: 'ra', label: 'Advisory', kind: 'select', options: ['Traffic advisory only', 'Climb', 'Descend', 'Adjust vertical speed', 'Monitor vertical speed', 'Crossing climb or descend', 'Reversal'], req: true },
      { k: 'traffic', label: 'Other traffic (callsign or type)', kind: 'text' },
      { k: 'horizontal', label: 'Closest distance (nm)', kind: 'num' },
      { k: 'vertical', label: 'Closest vertical distance (ft)', kind: 'num' },
      { k: 'followed', label: 'RA followed', kind: 'yesno', req: true },
      { k: 'deviation', label: 'Deviation from clearance (ft)', kind: 'num' },
      { k: 'atcInformed', label: 'ATC informed', kind: 'yesno' },
    ],
  },
  {
    id: 'unstable', name: 'Unstable approach / go-around', short: 'G/A', icon: 'M3 19h18M5 15l7-7 3 3 5-5M16 6h4v4',
    hint: 'An approach that was not stable at the gate, or any go-around.',
    fields: [
      { k: 'runway', label: 'Runway', kind: 'text', auto: f => f.landing?.runway ? `${f.landing.airport || f.arr} ${f.landing.runway}` : (f.diversion?.to || f.arr || '') },
      { k: 'gate', label: 'Stable gate', kind: 'select', options: ['1000 ft (instrument)', '500 ft (visual)'], req: true },
      { k: 'parameter', label: 'Main parameter out of limits', kind: 'select', options: ['Speed', 'Glide path', 'Lateral path', 'Sink rate', 'Configuration', 'Thrust', 'Checklist not complete', 'Weather / visibility', 'Runway occupied', 'ATC instruction', 'Other'], req: true },
      { k: 'goAround', label: 'Go-around flown', kind: 'yesno', req: true, auto: f => (f.goArounds?.length ? 'Yes' : '') },
      { k: 'gaHeight', label: 'Go-around height (ft)', kind: 'num', auto: f => (lastGa(f)?.raFt ? Math.round(lastGa(f).raFt) : '') },
      { k: 'gaReason', label: 'Reason given in the EFB', kind: 'text', auto: f => lastGa(f)?.reason || '' },
    ],
  },
  {
    id: 'hardlanding', name: 'Hard landing / tailstrike', short: 'LDG', icon: 'M3 19h18M4 14l6 1 9-4M12 9v3',
    hint: 'A landing above about 600 fpm, a bounce, or a suspected tailstrike.',
    fields: [
      { k: 'runway', label: 'Runway', kind: 'text', auto: f => f.landing?.runway ? `${f.landing.airport || f.arr} ${f.landing.runway}` : '' },
      { k: 'rate', label: 'Landing rate (fpm)', kind: 'num', req: true, auto: f => f.landing?.rate ?? '' },
      { k: 'bounce', label: 'Bounced landing', kind: 'yesno', req: true },
      { k: 'tailstrike', label: 'Tailstrike suspected', kind: 'yesno', req: true },
      { k: 'wind', label: 'Wind at touchdown', kind: 'text', placeholder: '270/18G28' },
      { k: 'inspection', label: 'Hard landing inspection requested', kind: 'yesno' },
    ],
  },
  {
    id: 'technical', name: 'Technical defect', short: 'TECH', icon: 'M14 6a4 4 0 00-5 5l-6 6 2 2 6-6a4 4 0 005-5l-2 2-2-2z',
    hint: 'A failure or defect that affected the flight.',
    fields: [
      { k: 'system', label: 'System', kind: 'select', options: ['Engines', 'APU', 'Electrical', 'Hydraulics', 'Flight controls', 'Landing gear and brakes', 'Fuel', 'Air and pressurisation', 'Ice and rain', 'Navigation and avionics', 'Fire protection', 'Doors', 'Other'], req: true },
      { k: 'message', label: 'ECAM / EICAS message', kind: 'text' },
      { k: 'phase', label: 'Phase of flight', kind: 'select', options: PHASES, req: true, auto: phaseOf },
      { k: 'qrh', label: 'QRH or ECAM procedure used', kind: 'text' },
      { k: 'effect', label: 'Effect on the flight', kind: 'select', options: ['None', 'Delay', 'Return to stand', 'Rejected takeoff', 'Return to departure', 'Diversion', 'Emergency declared'], req: true },
      { k: 'techLog', label: 'Entered in the technical log', kind: 'yesno' },
    ],
  },
  {
    id: 'fuel', name: 'Fuel event', short: 'FUEL', icon: 'M6 20V5a1 1 0 011-1h7a1 1 0 011 1v15M4 20h13M15 9h2l2 2v6a1 1 0 01-2 0v-3h-2',
    hint: 'Minimum or emergency fuel, low fuel on arrival, an imbalance or a suspected leak.',
    fields: [
      { k: 'event', label: 'Event', kind: 'select', auto: (f, st) => (f.fuel?.on != null && f.fuel.on < minLandingFuelKg(st) ? 'Landed below minimum fuel' : ''), options: ['Landed below minimum fuel', 'Minimum fuel declared', 'MAYDAY fuel declared', 'Landed below final reserve', 'Fuel imbalance', 'Suspected fuel leak', 'Fuel below plan'], req: true },
      { k: 'fuelArr', label: 'Fuel at landing (kg)', kind: 'num', auto: f => (f.fuel?.on ?? f.fuel?.in) != null ? Math.round(f.fuel.on ?? f.fuel.in) : '' },
      { k: 'reserve', label: 'Final reserve (kg)', kind: 'num' },
      { k: 'cause', label: 'Main cause', kind: 'select', options: ['Holding / delays', 'Weather', 'Routing', 'Higher burn than planned', 'Planning error', 'Technical', 'Other'], req: true },
    ],
  },
];

export const safetyType = id => SAFETY_TYPES.find(t => t.id === id);

export const hardLandingFpm = st => (+st?.hardLandingFpm > 0 ? +st.hardLandingFpm : 600);
export const minLandingFuelKg = st => (+st?.minLandingFuelKg > 0 ? +st.minLandingFuelKg : 1500);

// Safety reports this flight must have, filed and closed, before it can be signed and closed:
// any go-around or touch-and-go, a hard landing, or landing below the minimum fuel.
// Same rules as Store.RequiredSafety on the Windows host, which enforces them.
export function requiredReports(f, reports, st) {
  if (!f || f.id === 'none') return [];
  const mine = Object.values(reports || {}).filter(r => r.flight?.id === f.id);
  const out = [];
  const add = (type, why) => {
    const list = mine.filter(r => r.type === type);
    const closed = list.find(r => r.status === 'closed');
    out.push({ type, why, done: !!closed, report: closed || list.find(r => r.status !== 'closed') || null });
  };
  const ga = f.goArounds?.length || 0;
  if (ga) add('unstable', ga === 1 ? 'go-around detected' : `${ga} go-arounds detected`);
  if (f.landing?.rate >= hardLandingFpm(st)) add('hardlanding', `landing rate ${Math.round(f.landing.rate)} fpm`);
  if (f.fuel?.on != null && f.fuel.on < minLandingFuelKg(st)) add('fuel', `landed with ${Math.round(f.fuel.on).toLocaleString('en-GB')} kg, below the ${minLandingFuelKg(st).toLocaleString('en-GB')} kg minimum`);
  return out;
}
