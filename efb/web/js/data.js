// Reference data: IATA delay codes, special handling codes, turnaround steps and company message templates.

export const IATA_DELAYS = [
  ['06', 'OA', 'No gate or stand available due to own airline activity'],
  ['09', 'SG', 'Scheduled ground time less than declared minimum'],
  ['11', 'PD', 'Late check-in, acceptance after deadline'],
  ['12', 'PL', 'Late check-in, congestion in check-in area'],
  ['13', 'PE', 'Check-in error, passenger and baggage'],
  ['14', 'PO', 'Oversales, booking errors'],
  ['15', 'PH', 'Boarding, discrepancies and paging, missing checked-in passenger'],
  ['16', 'PS', 'Commercial publicity or passenger convenience, VIP, press'],
  ['17', 'PC', 'Catering order, late or incorrect order given to supplier'],
  ['18', 'PB', 'Baggage processing, sorting'],
  ['19', 'PW', 'Reduced mobility, boarding or deboarding of passengers with reduced mobility'],
  ['21', 'CD', 'Cargo documentation, errors'],
  ['22', 'CP', 'Cargo late positioning'],
  ['23', 'CC', 'Cargo late acceptance'],
  ['26', 'CU', 'Cargo late preparation in warehouse'],
  ['31', 'GD', 'Aircraft documentation late or inaccurate, weight and balance, load sheet'],
  ['32', 'GL', 'Loading or unloading, bulky or special load, lack of loading staff'],
  ['33', 'GE', 'Loading equipment, lack of or breakdown'],
  ['34', 'GS', 'Servicing equipment, lack of or breakdown'],
  ['35', 'GC', 'Aircraft cleaning'],
  ['36', 'GF', 'Fuelling or defuelling, fuel supplier'],
  ['37', 'GB', 'Catering, late delivery or loading'],
  ['38', 'GU', 'ULD, lack of or serviceability'],
  ['39', 'GT', 'Technical equipment, lack of or breakdown, pushback tug'],
  ['41', 'TD', 'Aircraft defects'],
  ['42', 'TM', 'Scheduled maintenance, late release'],
  ['43', 'TN', 'Non-scheduled maintenance, special checks'],
  ['44', 'TS', 'Spares and maintenance equipment, lack of or breakdown'],
  ['45', 'TA', 'AOG spares, to be carried to another station'],
  ['46', 'TC', 'Aircraft change for technical reasons'],
  ['47', 'TL', 'Standby aircraft, lack of planned standby aircraft'],
  ['51', 'DF', 'Damage during flight operations, bird or lightning strike, turbulence'],
  ['52', 'DG', 'Damage during ground operations, collisions, loading damage'],
  ['55', 'ED', 'Departure control system failure'],
  ['56', 'EC', 'Cargo preparation or documentation system failure'],
  ['57', 'EF', 'Flight plan system failure'],
  ['61', 'FP', 'Flight plan, late completion or change of flight documentation'],
  ['62', 'FF', 'Operational requirements, fuel, load alteration'],
  ['63', 'FT', 'Late crew boarding or departure procedures'],
  ['64', 'FS', 'Flight deck crew shortage'],
  ['65', 'FR', 'Flight deck crew special request'],
  ['66', 'FL', 'Late cabin crew boarding or departure procedures'],
  ['67', 'FC', 'Cabin crew shortage'],
  ['68', 'FA', 'Cabin crew error or special request'],
  ['69', 'FB', 'Captain request for security check'],
  ['71', 'WO', 'Weather at departure station'],
  ['72', 'WT', 'Weather at destination station'],
  ['73', 'WR', 'Weather en route or at alternate'],
  ['75', 'WI', 'De-icing of aircraft'],
  ['76', 'WS', 'Removal of snow, ice, water or sand from airport'],
  ['77', 'WG', 'Ground handling impaired by adverse weather'],
  ['81', 'AT', 'ATFM due to ATC en-route demand or capacity'],
  ['82', 'AX', 'ATFM due to ATC staff or equipment en route'],
  ['83', 'AE', 'ATFM due to restriction at destination airport'],
  ['84', 'AW', 'ATFM due to weather at destination'],
  ['85', 'AS', 'Mandatory security'],
  ['86', 'AG', 'Immigration, customs, health'],
  ['87', 'AF', 'Airport facilities, parking stands, ramp congestion'],
  ['88', 'AD', 'Restrictions at destination airport'],
  ['89', 'AM', 'Restrictions at departure airport, start-up and pushback, ATC'],
  ['91', 'RL', 'Load connection, awaiting load from another flight'],
  ['92', 'RT', 'Through check-in error'],
  ['93', 'RA', 'Aircraft rotation, late arrival of aircraft from another flight'],
  ['94', 'RS', 'Cabin crew rotation'],
  ['95', 'RC', 'Crew rotation, awaiting crew from another flight'],
  ['96', 'RO', 'Operations control, rerouting, diversion, consolidation'],
  ['97', 'MI', 'Industrial action within own airline'],
  ['98', 'MO', 'Industrial action outside own airline'],
  ['99', 'MX', 'Other reason, not matching any code above'],
].map(([code, alpha, text]) => ({ code, alpha, text }));

export const SPECIAL_CODES = [
  { code: 'WCHR', text: 'Wheelchair, can use stairs (ramp)', weight: 10 },
  { code: 'WCHS', text: 'Wheelchair, cannot use stairs', weight: 5 },
  { code: 'WCHC', text: 'Wheelchair, immobile, cabin seat', weight: 2 },
  { code: 'UMNR', text: 'Unaccompanied minor', weight: 6 },
  { code: 'INF', text: 'Infant on lap', weight: 12 },
  { code: 'BLND', text: 'Blind passenger', weight: 2 },
  { code: 'DEAF', text: 'Deaf passenger', weight: 2 },
  { code: 'MAAS', text: 'Meet and assist', weight: 5 },
  { code: 'PETC', text: 'Pet in cabin', weight: 3 },
  { code: 'MEDA', text: 'Medical case', weight: 1 },
  { code: 'DHC', text: 'Deadhead crew, positioning', weight: 6 },
  { code: 'ID', text: 'Company staff on duty travel', weight: 6 },
  { code: 'VIP', text: 'Very important passenger', weight: 1 },
];

export const TURNAROUND_STEPS = [
  'Chocks on', 'Ground power connected', 'Passenger steps or jetway', 'Deboarding complete', 'Cabin cleaning',
  'Catering', 'Water and waste service', 'Fuelling', 'Baggage and cargo loaded', 'Boarding started',
  'Boarding complete', 'Load sheet received', 'Doors closed', 'Pushback or start clearance',
];

export const GO_AROUND_REASONS = [
  'Unstable approach', 'Runway occupied', 'ATC instruction', 'Wind shear or gusts', 'Weather below minima',
  'Traffic separation', 'Aircraft configuration', 'Long or deep landing expected', 'Training or practice', 'Other',
];

export const RECEIPT_TYPES = ['Fuel', 'Catering', 'Handling', 'Pushback', 'De-icing', 'Cleaning', 'Water and waste', 'Ground power', 'Other'];

export const SAFETY_CATEGORIES = ['Bird strike', 'Turbulence', 'TCAS RA', 'Technical', 'Medical', 'Unruly passenger', 'Ground incident', 'ATC', 'Other'];

export const CREW_ROLES = ['PIC', 'FO', 'Relief', 'Purser', 'Cabin crew', 'Observer'];

export const ALL_TABS = [
  { id: 'flight', label: 'Flight', icon: 'M3 12l18-8-6 16-3-7-9-1z' },
  { id: 'occ', label: 'OCC', icon: 'M4 5h16v11H8l-4 4V5z' },
  { id: 'loads', label: 'Loads', icon: 'M4 7h16v12H4zM8 7V4h8v3' },
  { id: 'navlog', label: 'NavLog', icon: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5' },
  { id: 'times', label: 'Times', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3' },
  { id: 'landing', label: 'Landing', icon: 'M3 19h18M4 14l6 1 9-4-2-3-8 3-3-3-2 1 2 4z' },
  { id: 'gsx', label: 'GSX', icon: 'M3 16h13V8H3zM16 11h3l2 3v2h-5M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z' },
  { id: 'charts', label: 'Charts', icon: 'M4 5l5-2 6 2 5-2v16l-5 2-6-2-5 2zM9 3v16M15 5v16' },
  { id: 'docs', label: 'Documents', icon: 'M6 3h9l4 4v14H6zM15 3v4h4' },
  { id: 'report', label: 'Report', icon: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3' },
  { id: 'settings', label: 'Settings', icon: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4' },
];

// Company messages sent by "OCC" as the flight progresses. {placeholders} are filled from the flight.
export const OCC_TEMPLATES = {
  release: 'OFP {flightNo} {dep}-{arr} released. Planned block fuel {blockFuel}. Confirm receipt.',
  slot: 'Slot information: CTOT {ctot}. Be ready for start-up at TSAT {tsat}.',
  pax: 'Booked passengers {booked} of {seats}. Special handling: {specials}.',
  loadsheet: 'Final load sheet edition {edition} available. Please check and sign.',
  airborne: 'Airborne time {off} received. Have a good flight.',
  landed: 'Landing time {on} received. Stand information will follow from handling.',
  blockin: 'On blocks {in}. Please complete the journey log and close the flight.',
  goaround: 'Go-around noted at {time}. A reason is required in the journey log before closing.',
  diversion: 'Diversion to {to} acknowledged. Handling at {to} has been informed.',
};
