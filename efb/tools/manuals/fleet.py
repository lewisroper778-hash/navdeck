"""Fleet data for the NAVDECK simulator QRH and FCOM.

All figures are typical published values rounded for flight-simulator use. Real aircraft and
simulator add-ons differ by weight variant, engine and operator, so every table in the manuals
says "typical" and tells the pilot to check their own aircraft.
Weights in kg, speeds in KIAS, fuel capacity in litres (converted to kg at 0.80 kg/L).
"""

AIRBUS_FBW = dict(maker="Airbus", alert="ECAM", law=True, sidestick=True, checklist_style="ecam",
                  thrust="A/THR", fma="FMA", trim="automatic pitch trim (manual trim wheel as backup)")
BOEING = dict(maker="Boeing", alert="EICAS", law=False, sidestick=False, checklist_style="boeing",
              thrust="A/T", fma="FMA", trim="electric stabilizer trim switches on the yoke")

FAMILIES = {
    "A220": dict(AIRBUS_FBW, name="Airbus A220", short="A220", alert="EICAS", checklist_style="boeing",
        engines=2, eng_type="Pratt & Whitney PW1500G geared turbofan", apu="Pratt & Whitney APS2600 APU",
        hyd=["1", "2", "3"], hyd_note="Three independent hydraulic systems (1, 2 and 3). Systems 1 and 2 are driven by engine pumps; system 3 is electric with a ram air turbine (RAT) backup.",
        elec="Two engine-driven variable-frequency generators and an APU generator, with a RAT generator and batteries for emergency power.",
        rat=True, fbw_note="Full fly-by-wire with sidesticks. Normal mode gives envelope protection; direct mode removes it.",
        flaps=[("1", 230), ("2", 210), ("3", 210), ("4", 180), ("5", 170)], flap_land=["4", "5"], flap_to=["1", "2", "3"],
        gear=dict(vlo_ext=250, vlo_ret=220, vle=250), vmo=330, mmo=0.82, ceiling=41000,
        cruise_mach=0.78, crosswind=27, widebody=False, etops=False,
        doors="Two passenger doors and two service doors."),
    "A320": dict(AIRBUS_FBW, name="Airbus A320 family", short="A320 family",
        engines=2, eng_type="CFM56-5B / IAE V2500 (ceo), CFM LEAP-1A / PW1100G (neo)", apu="Honeywell 131-9A APU",
        hyd=["Green", "Blue", "Yellow"], hyd_note="Three hydraulic systems: Green (engine 1 pump), Yellow (engine 2 pump plus electric pump and hand pump for cargo doors) and Blue (electric pump, RAT backup). A power transfer unit (PTU) links Green and Yellow without transferring fluid.",
        elec="Two engine-driven integrated drive generators (IDG), one APU generator, an emergency generator driven by the Blue system (RAT) and two batteries. Transformer rectifiers supply the DC network.",
        rat=True, fbw_note="Fly-by-wire with sidesticks. Normal law gives flight envelope protection; alternate and direct law remove protections step by step.",
        flaps=[("1", 230), ("1+F", 215), ("2", 200), ("3", 185), ("FULL", 177)], flap_land=["3", "FULL"], flap_to=["1+F", "2", "3"],
        gear=dict(vlo_ext=250, vlo_ret=220, vle=280), vmo=350, mmo=0.82, ceiling=39800,
        cruise_mach=0.78, crosswind=38, widebody=False, etops=False,
        doors="Four passenger doors and four overwing emergency exits (two on the A319)."),
    "A330": dict(AIRBUS_FBW, name="Airbus A330", short="A330",
        engines=2, eng_type="GE CF6-80E1 / PW4000 / RR Trent 700 (ceo), RR Trent 7000 (neo)", apu="Honeywell 331-350 APU",
        hyd=["Green", "Blue", "Yellow"], hyd_note="Three independent hydraulic systems (Green, Blue, Yellow). Green is driven by pumps on both engines, Blue by engine 1, Yellow by engine 2, each with an electric pump. The RAT pressurises Green.",
        elec="Two IDGs, one APU generator, a Constant Speed Motor/Generator (CSM/G) driven by the Green system on RAT, and three batteries.",
        rat=True, fbw_note="Fly-by-wire with sidesticks, the same laws and protections as the A320 family.",
        flaps=[("1", 240), ("1+F", 215), ("2", 196), ("3", 186), ("FULL", 180)], flap_land=["3", "FULL"], flap_to=["1+F", "2", "3"],
        gear=dict(vlo_ext=250, vlo_ret=220, vle=250), vmo=330, mmo=0.86, ceiling=41450,
        cruise_mach=0.82, crosswind=34, widebody=True, etops=True,
        doors="Eight passenger doors (four per side)."),
    "A340": dict(AIRBUS_FBW, name="Airbus A340", short="A340",
        engines=4, eng_type="CFM56-5C (A340-300), RR Trent 556 (A340-600)", apu="Honeywell 331-350 / 331-600 APU",
        hyd=["Green", "Blue", "Yellow"], hyd_note="Three independent hydraulic systems. Green is driven by engines 1 and 4, Blue by engine 2 and Yellow by engine 3, with electric pumps on each. The RAT pressurises Green.",
        elec="Four IDGs, one or two APU generators, a CSM/G on RAT and three batteries.",
        rat=True, fbw_note="Fly-by-wire with sidesticks, the same laws and protections as the A330.",
        flaps=[("1", 240), ("1+F", 215), ("2", 196), ("3", 186), ("FULL", 180)], flap_land=["3", "FULL"], flap_to=["1+F", "2", "3"],
        gear=dict(vlo_ext=250, vlo_ret=220, vle=250), vmo=330, mmo=0.86, ceiling=41000,
        cruise_mach=0.82, crosswind=30, widebody=True, etops=False,
        doors="Eight passenger doors (ten on the A340-600)."),
    "A350": dict(AIRBUS_FBW, name="Airbus A350", short="A350",
        engines=2, eng_type="Rolls-Royce Trent XWB", apu="Honeywell HGT1700 APU",
        hyd=["Green", "Yellow"], hyd_note="Two independent 5000 psi hydraulic systems (Green and Yellow), each driven by engine pumps. Electrically powered local actuators (EHA and EBHA) give a third, electrical, control path.",
        elec="Four engine-driven variable-frequency generators (two per engine), an APU generator, a RAT generator and four batteries.",
        rat=True, fbw_note="Fly-by-wire with sidesticks. Laws and protections as on other Airbus types; the electrical backup system keeps control if both hydraulic systems fail.",
        flaps=[("1", 255), ("1+F", 220), ("2", 212), ("3", 195), ("FULL", 186)], flap_land=["3", "FULL"], flap_to=["1+F", "2", "3"],
        gear=dict(vlo_ext=250, vlo_ret=250, vle=250), vmo=340, mmo=0.89, ceiling=43100,
        cruise_mach=0.85, crosswind=35, widebody=True, etops=True,
        doors="Eight passenger doors (four per side)."),
    "737": dict(BOEING, name="Boeing 737", short="737",
        engines=2, eng_type="CFM56-7B (NG), CFM LEAP-1B (MAX)", apu="Honeywell 131-9B APU",
        hyd=["A", "B", "Standby"], hyd_note="Hydraulic systems A and B, each with an engine-driven pump and an electric pump, plus a standby system for the rudder, leading edge devices and thrust reversers. Manual reversion is available for the ailerons and elevator.",
        elec="Two engine-driven IDGs and an APU generator. The battery and static inverter supply the standby buses when both generators are lost.",
        rat=False, fbw_note="Conventional hydraulically powered flight controls with manual reversion. The stabilizer is trimmed electrically or with the manual trim wheels.",
        flaps=[("1", 250), ("2", 250), ("5", 250), ("10", 210), ("15", 200), ("25", 190), ("30", 175), ("40", 162)], flap_land=["15", "30", "40"], flap_to=["1", "5", "10", "15", "25"],
        gear=dict(vlo_ext=270, vlo_ret=235, vle=320), vmo=340, mmo=0.82, ceiling=41000,
        cruise_mach=0.785, crosswind=33, widebody=False, etops=False,
        doors="Two passenger doors, two service doors and overwing exits."),
    "757": dict(BOEING, name="Boeing 757", short="757",
        engines=2, eng_type="Rolls-Royce RB211-535 / Pratt & Whitney PW2000", apu="Honeywell 331-200 APU",
        hyd=["Left", "Center", "Right"], hyd_note="Left, Center and Right hydraulic systems. Left and Right have engine-driven pumps; Center has two electric pumps and the ram air turbine (RAT). A power transfer unit lets the Right system power the Left system's gear and flap functions.",
        elec="Two engine-driven IDGs, an APU generator, a battery and a standby power system. There is no electrical RAT generator: the RAT is hydraulic.",
        rat=True, fbw_note="Conventional hydraulically powered flight controls with yoke and stabilizer trim.",
        flaps=[("1", 240), ("5", 220), ("15", 210), ("20", 195), ("25", 190), ("30", 162)], flap_land=["25", "30"], flap_to=["5", "15", "20"],
        gear=dict(vlo_ext=270, vlo_ret=270, vle=270), vmo=350, mmo=0.86, ceiling=42000,
        cruise_mach=0.80, crosswind=40, widebody=False, etops=True,
        doors="Four main passenger doors and overwing exits (more doors on the 757-300)."),
    "767": dict(BOEING, name="Boeing 767", short="767",
        engines=2, eng_type="GE CF6-80C2 / Pratt & Whitney PW4000", apu="Honeywell 331-200 APU",
        hyd=["Left", "Center", "Right"], hyd_note="Left, Center and Right hydraulic systems. Left and Right have engine-driven and electric pumps; Center has two electric pumps, an air-driven pump on some aircraft and the RAT.",
        elec="Two IDGs, an APU generator, a hydraulic motor generator on some aircraft, the main battery and the standby inverter.",
        rat=True, fbw_note="Conventional hydraulically powered flight controls with yoke and stabilizer trim.",
        flaps=[("1", 250), ("5", 230), ("15", 210), ("20", 195), ("25", 190), ("30", 170)], flap_land=["25", "30"], flap_to=["5", "15", "20"],
        gear=dict(vlo_ext=270, vlo_ret=270, vle=270), vmo=360, mmo=0.86, ceiling=43100,
        cruise_mach=0.80, crosswind=40, widebody=True, etops=True,
        doors="Four main passenger doors plus overwing exits."),
    "777": dict(BOEING, name="Boeing 777", short="777", law=True,
        engines=2, eng_type="GE GE90 / Pratt & Whitney PW4000-112 / RR Trent 800", apu="Honeywell 331-500 APU",
        hyd=["Left", "Center", "Right"], hyd_note="Left, Center and Right hydraulic systems. Left and Right each have an engine-driven pump and an electric demand pump; Center has two electric pumps, two air-driven demand pumps and the RAT.",
        elec="Two IDGs, an APU generator, two backup generators driven by the engines, a RAT generator and two batteries.",
        rat=True, fbw_note="Fly-by-wire with conventional yokes. Normal mode gives envelope protection (stall, overspeed, bank angle); secondary and direct modes remove some or all of it.",
        flaps=[("1", 255), ("5", 235), ("15", 215), ("20", 195), ("25", 185), ("30", 170)], flap_land=["25", "30"], flap_to=["5", "15", "20"],
        gear=dict(vlo_ext=270, vlo_ret=270, vle=270), vmo=330, mmo=0.87, ceiling=43100,
        cruise_mach=0.84, crosswind=38, widebody=True, etops=True,
        doors="Eight or ten passenger doors depending on variant."),
    "787": dict(BOEING, name="Boeing 787 Dreamliner", short="787", law=True,
        engines=2, eng_type="GE GEnx-1B / RR Trent 1000", apu="Hamilton Sundstrand APS5000 APU",
        hyd=["Left", "Center", "Right"], hyd_note="Left, Center and Right 5000 psi hydraulic systems. Left and Right have engine-driven and electric pumps; Center has electric pumps and the RAT.",
        elec="A largely 'more-electric' design: four 250 kVA starter-generators (two per engine), two APU starter-generators, a RAT generator and two batteries. Cabin air comes from electric compressors, not engine bleed.",
        rat=True, fbw_note="Fly-by-wire with conventional yokes. Normal, secondary and direct modes, as on the 777.",
        flaps=[("1", 250), ("5", 230), ("15", 200), ("17", 200), ("18", 190), ("20", 190), ("25", 180), ("30", 175)], flap_land=["25", "30"], flap_to=["5", "15", "17", "18", "20"],
        gear=dict(vlo_ext=270, vlo_ret=270, vle=270), vmo=350, mmo=0.90, ceiling=43100,
        cruise_mach=0.85, crosswind=40, widebody=True, etops=True,
        doors="Eight passenger doors (four per side)."),
}

# key, family, title, engine, MTOW, MLW, MZFW, fuel litres, length m, span m, seats, range nm, burn kg/h
_V = [
    ("A220-100", "A220", "Airbus A220-100", "PW1500G", 63100, 51029, 48330, 21805, 35.0, 35.1, "100-135", 3450, 1750),
    ("A220-300", "A220", "Airbus A220-300", "PW1500G", 70900, 61000, 58000, 21805, 38.7, 35.1, "120-160", 3350, 1950),
    ("A319", "A320", "Airbus A319", "CFM56-5B / V2500", 75500, 62500, 58500, 24210, 33.8, 35.8, "124-156", 3700, 2300),
    ("A320ceo", "A320", "Airbus A320ceo", "CFM56-5B / V2500", 78000, 66000, 62500, 24210, 37.6, 35.8, "150-180", 3300, 2500),
    ("A320neo", "A320", "Airbus A320neo", "LEAP-1A / PW1100G", 79000, 67400, 64300, 23860, 37.6, 35.8, "150-194", 3500, 2100),
    ("A321ceo", "A320", "Airbus A321ceo", "CFM56-5B / V2500", 93500, 77800, 73800, 24050, 44.5, 35.8, "185-220", 3200, 2900),
    ("A321neo", "A320", "Airbus A321neo", "LEAP-1A / PW1100G", 97000, 79200, 75600, 23490, 44.5, 35.8, "180-244", 4000, 2500),
    ("A330-200", "A330", "Airbus A330-200", "CF6-80E1 / PW4000 / Trent 700", 242000, 182000, 170000, 139090, 58.8, 60.3, "250-290", 7250, 5600),
    ("A330-300", "A330", "Airbus A330-300", "CF6-80E1 / PW4000 / Trent 700", 242000, 187000, 175000, 139090, 63.7, 60.3, "290-330", 6350, 5800),
    ("A330-900neo", "A330", "Airbus A330-900neo", "Trent 7000", 251000, 191000, 181000, 139090, 63.7, 64.0, "260-310", 7200, 5300),
    ("A340-300", "A340", "Airbus A340-300", "CFM56-5C", 276500, 192000, 181000, 147850, 63.7, 60.3, "270-300", 7400, 6800),
    ("A340-600", "A340", "Airbus A340-600", "Trent 556", 380000, 265000, 251000, 195880, 75.4, 63.5, "320-380", 7900, 8600),
    ("A350-900", "A350", "Airbus A350-900", "Trent XWB-84", 283000, 207000, 195700, 141000, 66.8, 64.75, "300-350", 8100, 5900),
    ("A350-1000", "A350", "Airbus A350-1000", "Trent XWB-97", 319000, 236000, 223000, 159000, 73.8, 64.75, "350-410", 8700, 6800),
    ("737-700", "737", "Boeing 737-700", "CFM56-7B", 70080, 58604, 55202, 26020, 33.6, 35.8, "126-149", 3000, 2300),
    ("737-800", "737", "Boeing 737-800", "CFM56-7B", 79016, 66361, 62732, 26020, 39.5, 35.8, "162-189", 2900, 2500),
    ("737-900ER", "737", "Boeing 737-900ER", "CFM56-7B", 85139, 71350, 67721, 29660, 42.1, 35.8, "177-220", 2950, 2700),
    ("737 MAX 8", "737", "Boeing 737 MAX 8", "LEAP-1B", 82191, 69309, 65952, 25816, 39.5, 35.9, "162-210", 3550, 2150),
    ("757-200", "757", "Boeing 757-200", "RB211-535 / PW2037/2040", 115680, 89811, 83461, 43490, 47.3, 38.1, "200-239", 3900, 3300),
    ("757-300", "757", "Boeing 757-300", "RB211-535E4", 123600, 101600, 95250, 43400, 54.4, 38.1, "243-280", 3400, 3600),
    ("767-200ER", "767", "Boeing 767-200ER", "CF6-80C2 / PW4000", 179170, 136080, 117940, 91380, 48.5, 47.6, "180-245", 6590, 4800),
    ("767-300ER", "767", "Boeing 767-300ER", "CF6-80C2 / PW4000", 186880, 145150, 133810, 91380, 54.9, 47.6, "210-290", 5980, 5000),
    ("767-400ER", "767", "Boeing 767-400ER", "CF6-80C2", 204120, 158760, 149690, 91370, 61.4, 51.9, "245-300", 5625, 5300),
    ("777-200ER", "777", "Boeing 777-200ER", "GE90-94B / PW4090 / Trent 895", 297550, 213000, 195000, 171170, 63.7, 60.9, "300-400", 7065, 6900),
    ("777-200LR", "777", "Boeing 777-200LR", "GE90-110B", 347450, 223168, 209106, 181280, 63.7, 64.8, "300-320", 8555, 7400),
    ("777-300ER", "777", "Boeing 777-300ER", "GE90-115B", 351530, 251290, 237680, 181280, 73.9, 64.8, "350-450", 7370, 7800),
    ("777F", "777", "Boeing 777 Freighter", "GE90-110B", 347800, 260816, 248115, 181280, 63.7, 64.8, "Cargo (102 t payload)", 4970, 7600),
    ("787-8", "787", "Boeing 787-8", "GEnx-1B / Trent 1000", 227930, 172365, 161025, 126206, 56.7, 60.1, "240-250", 7305, 4900),
    ("787-9", "787", "Boeing 787-9", "GEnx-1B / Trent 1000", 254011, 192777, 181437, 126372, 62.8, 60.1, "280-300", 7565, 5400),
    ("787-10", "787", "Boeing 787-10", "GEnx-1B / Trent 1000", 254011, 201849, 192777, 126372, 68.3, 60.1, "330-340", 6330, 5800),
]

VARIANTS = []
for key, fam, title, eng, mtow, mlw, mzfw, fuel_l, length, span, seats, rng, burn in _V:
    VARIANTS.append(dict(key=key, family=fam, title=title, engine=eng, mtow=mtow, mlw=mlw, mzfw=mzfw,
                         fuel_l=fuel_l, fuel_kg=round(fuel_l * 0.8 / 10) * 10, length=length, span=span,
                         seats=seats, range=rng, burn=burn, f=FAMILIES[fam]))

# Typical VREF at maximum landing weight with full landing flaps (kt).
VREF = {"A220-100": 125, "A220-300": 130, "A319": 130, "A320ceo": 135, "A320neo": 135, "A321ceo": 145, "A321neo": 145,
        "A330-200": 140, "A330-300": 145, "A330-900neo": 145, "A340-300": 145, "A340-600": 155, "A350-900": 140,
        "A350-1000": 145, "737-700": 135, "737-800": 145, "737-900ER": 150, "737 MAX 8": 145, "757-200": 135,
        "757-300": 140, "767-200ER": 140, "767-300ER": 145, "767-400ER": 150, "777-200ER": 140, "777-200LR": 145,
        "777-300ER": 150, "777F": 150, "787-8": 140, "787-9": 145, "787-10": 150}
for v in VARIANTS:
    v["vref"] = VREF[v["key"]]

# Variant-specific overrides of family values.
OVERRIDES = {
    "A321ceo": dict(flaps=[("1", 235), ("1+F", 225), ("2", 215), ("3", 195), ("FULL", 190)]),
    "A321neo": dict(flaps=[("1", 235), ("1+F", 225), ("2", 215), ("3", 195), ("FULL", 190)]),
    "A340-600": dict(flaps=[("1", 250), ("1+F", 220), ("2", 205), ("3", 196), ("FULL", 186)]),
    "777-300ER": dict(flaps=[("1", 265), ("5", 245), ("15", 230), ("20", 225), ("25", 200), ("30", 180)]),
    "777-200LR": dict(flaps=[("1", 265), ("5", 245), ("15", 230), ("20", 225), ("25", 200), ("30", 180)]),
    "777F": dict(flaps=[("1", 265), ("5", 245), ("15", 230), ("20", 225), ("25", 200), ("30", 180)]),
    "757-300": dict(crosswind=33),
    "737 MAX 8": dict(note_max=True),
}
for v in VARIANTS:
    if v["key"] in OVERRIDES:
        v["f"] = dict(v["f"], **OVERRIDES[v["key"]])
