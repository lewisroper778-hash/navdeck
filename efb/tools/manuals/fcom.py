"""Original NAVDECK simulator FCOM (flight crew operating manual) content.

A plain-language operating guide for flight simulation, written by NAVDECK. It follows general
airline practice and typical published aircraft data. It is not a manufacturer's FCOM.

Each chapter is a list of blocks:
  ("h", text)                 sub-heading
  ("p", text)                 paragraph
  ("ul", [items])             bullet list
  ("t", [headers], [rows])    table
  ("flow", [(item, action)])  flow or checklist
  ("note", text)              boxed note
"""


def _airbus(v):
    return v["f"]["maker"] == "Airbus" and v["family"] != "A220"


ENGINE_WORDS = {2: "two", 3: "three", 4: "four"}


def cruise(f):
    return f["perf"]["cruise_short"] if f.get("perf") else f"M{f['cruise_mach']:.2f}"


def climb_mach(f):
    return f"M{max(0.70, f['cruise_mach'] - 0.02):.2f}"


def _is_ab_style(v):
    return v["f"]["maker"] == "Airbus"


def general(v):
    f = v["f"]
    sibs = ""
    return [
        ("p", f"This operating guide covers the {v['title']} for flight simulation. It explains how the aircraft "
              f"works, its limits, and how to fly it from the gate to the gate the way an airline crew would. "
              f"Read it alongside the {v['title']} QRH, which holds the non-normal and emergency checklists."),
        ("note", "Every figure is a typical published value, rounded. Your simulator add-on may use a different weight "
                 "variant, engine or software standard. Where it differs, your add-on's own documentation wins."),
        ("h", "The aircraft"),
        ("p", f"The {v['title']} is a {'twin-aisle, wide-body' if f['widebody'] else 'single-aisle, narrow-body'} airliner "
              f"with {ENGINE_WORDS[f['engines']]} {v['engine']} {'turboprop engines' if f.get('turboprop') else 'engines'}. {f['doors']} "
              f"Typical seating is {v['seats']}, and typical range is about {v['range']:,} nm."),
        ("t", ["Item", "Typical value"], [
            ("Engines", f"{f['engines']} x {v['engine']}"), ("Length", f"{v['length']} m"), ("Wingspan", f"{v['span']} m"),
            ("Seats", v["seats"]), ("Range", f"{v['range']:,} nm"), ("Max operating altitude", f"{f['ceiling']:,} ft"),
            ("Cruise speed", cruise(f)), ("Typical fuel burn in cruise", f"about {v['burn']:,} kg/h"),
            ("APU", f["apu"] or "None (Hotel mode on engine 2)"),
        ]),
        ("h", "Cockpit philosophy"),
        ("p", (
            "Airbus cockpits are 'dark and quiet': with everything normal, no overhead lights are on. A light shows "
            "only when something is off, failed or needs action. The ECAM (electronic centralised aircraft monitor) "
            "shows system pages and lists actions for each failure. Read it, confirm it, then do it."
        ) if _airbus(v) else (
            f"The cockpit follows the 'dark cockpit' idea: in normal operation few lights are on. "
            f"{f['alert']} (engine indication and crew alerting system) shows engine data and alert messages in three levels: "
            "warnings (red, act now), cautions (amber, act soon) and advisories (amber, indented, be aware)."
        )),
        ("p", f"Flight controls: {f['fbw_note']}"),
        ("h", "Crew roles"),
        ("ul", ["PF (pilot flying) flies the aircraft, sets the flight path and calls for configuration changes and checklists.",
                "PM (pilot monitoring) runs the radios, checklists and paperwork, and watches the PF's flight path.",
                "Both pilots check every FMA (flight mode annunciator) change and call it out.",
                "Before acting on a failure the crew confirms it, one reads and one acts, and critical switches (engine master, fire, IDG) are confirmed by both."]),
    ]


def limitations(v):
    f = v["f"]
    return [
        ("h", "Weights"),
        ("t", ["Weight", "Typical maximum"], [("Maximum takeoff weight (MTOW)", f"{v['mtow']:,} kg"),
                                               ("Maximum landing weight (MLW)", f"{v['mlw']:,} kg"),
                                               ("Maximum zero fuel weight (MZFW)", f"{v['mzfw']:,} kg"),
                                               ("Usable fuel", f"{v['fuel_l']:,} L (about {v['fuel_kg']:,} kg at 0.80 kg/L)")]),
        ("h", "Speeds"),
        ("t", ["Limit", "Value"], [("VMO / MMO", f"{f['vmo']} kt / M{f['mmo']:.2f}"),
                                   ("Landing gear extension (VLO)", f"{f['gear']['vlo_ext']} kt"),
                                   ("Landing gear retraction (VLO)", f"{f['gear']['vlo_ret']} kt"),
                                   ("Landing gear extended (VLE)", f"{f['gear']['vle']} kt"),
                                   ("Wipers", "230 kt"), ("Cockpit window open (if certified)", "200 kt")]),
        ("h", "Flap and slat limit speeds"),
        ("t", ["Setting", "Max speed (kt)", "Use"],
         [(a, str(s), ("Takeoff / landing" if a in f["flap_to"] and a in f["flap_land"] else "Takeoff" if a in f["flap_to"] else "Landing" if a in f["flap_land"] else "Approach / hold"))
          for a, s in f["flaps"]]),
        ("h", "Environment"),
        ("t", ["Limit", "Typical value"], [("Maximum demonstrated crosswind (dry)", f"{f['crosswind']} kt"),
                                           ("Maximum tailwind (takeoff and landing)", "10 kt (15 kt with approval)"),
                                           ("Runway slope", "±2%"), ("Airport pressure altitude", "-2,000 to 9,200 ft (typical)"),
                                           ("Maximum operating altitude", f"{f['ceiling']:,} ft"),
                                           ("Outside air temperature", "about -54 °C to ISA +35/40 °C")]),
        ("h", "Autoflight"),
        ("t", ["Item", "Typical minimum"], [("Autopilot engage after takeoff", "100 ft AGL (or 5 s after liftoff)"),
                                            ("Autopilot on non-precision approach", "MDA or 250 ft AGL, whichever is higher"),
                                            ("Autopilot on ILS without autoland", "160 ft AGL"),
                                            ("Autoland", "CAT II / III with dual or triple autopilot, crosswind about 20 kt, headwind 25 kt, tailwind 10 kt")]),
        ("h", "Engines and APU"),
        ("ul", ["Use the takeoff/go-around thrust limit for no more than 5 minutes (10 minutes with an engine out).",
                "Starter: a fixed duty cycle applies (typically 2 or 3 attempts, then a cooling period).",
                "Reverse thrust: do not use in flight. Reduce to idle reverse by about 70 kt on the ground.",
                (f"APU ({f['apu']}): bleed use has an altitude limit, typically around 20,000 to 25,000 ft; the generator works up to the ceiling." if f["apu"] else f.get("hotel", "No APU."))]),
        ("h", "Fuel"),
        ("ul", ["Do not take off with a fuel imbalance between the wing tanks beyond the limit set in your add-on (often about 500 to 1,500 kg).",
                "Fuel in the centre tank is used first; the wing tanks must be full when the centre tank holds fuel.",
                "Minimum fuel temperature: 3 °C above the fuel freezing point."]),
    ]


def systems(v):
    f = v["f"]
    ab = _airbus(v)
    fam = v["family"]
    bleed = fam != "787"
    out = []
    out += [("h", "Air conditioning and pressurisation"),
            ("p", ("Two packs make conditioned air from engine or APU bleed air. " if bleed else
                   "Unlike most airliners, the 787 has no engine bleed air for the cabin. Electric cabin air compressors feed the packs. ")
                  + "Air is mixed with recirculated cabin air and sent to the cabin zones. Cabin pressure is controlled by outflow valves. "
                    "The pressurisation system schedules the cabin altitude automatically from the landing elevation in the FMS."),
            ("ul", ["Maximum cabin altitude in normal cruise: about 8,000 ft (6,000 ft on newer types).",
                    "Cabin altitude warning: 9,550 to 10,000 ft.",
                    "Passenger oxygen masks drop automatically at about 14,000 ft cabin altitude."])]
    out += [("h", "Anti-ice and rain"),
            ("p", "Engine anti-ice protects the engine intakes; wing anti-ice protects the leading edges " +
                  ("using electric heater mats" if fam == "787" else "using hot bleed air") +
                  ". Probes and windows are heated automatically when an engine runs. Use engine anti-ice in icing conditions: "
                  "visible moisture with a temperature of 10 °C or below on the ground and for takeoff, or a TAT of 10 °C or below in flight.")]
    out += [("h", "Autoflight"),
            ("p", ("The FMGS (flight management and guidance system) combines the autopilot, flight directors, autothrust and FMS. "
                   "The FCU (flight control unit) on the glareshield sets speed, heading, altitude and vertical speed. "
                   "Pushing a knob gives managed guidance (the FMS flies it); pulling it gives selected guidance (you fly it). "
                   "The A/THR is active between the CL and IDLE detents; the thrust levers do not move.") if ab else
                  ("The autopilot flight director system (AFDS) is controlled from the mode control panel (MCP). "
                   "LNAV and VNAV follow the FMC route and profile; HDG SEL, LVL CHG / FLCH, V/S and ALT HOLD are tactical modes. "
                   f"The {'autothrust (A/THR)' if fam == 'A220' else 'autothrottle'} moves the thrust levers.")),
            ("t", ["Mode", "What it does"], (
                [("SRS", "Speed reference after takeoff / go-around (V2+10)"), ("NAV", "Follows the FMS lateral route"),
                 ("CLB / DES", "Managed climb / descent with constraints"), ("OP CLB / OP DES", "Open climb / descent, ignoring constraints"),
                 ("ALT / ALT CST", "Altitude hold / altitude constraint"), ("LOC / G/S", "ILS localiser / glide slope"), ("LAND / FLARE / ROLL OUT", "Autoland phases")]
                if ab else
                [("TO/GA", "Takeoff and go-around guidance"), ("LNAV", "Follows the FMC lateral route"),
                 ("VNAV", "Follows the FMC vertical path and speeds"), ("LVL CHG / FLCH", "Climb or descend on speed with fixed thrust"),
                 ("V/S", "Fixed vertical speed"), ("ALT HOLD", "Holds the selected altitude"), ("VOR/LOC, APP", "Localiser and glide slope capture")]))]
    out += [("h", "Electrical"), ("p", f["elec"]),
            ("ul", ["On the ground, external power or the APU supplies the aircraft.",
                    "In flight, losing one generator is covered automatically by the others or the APU.",
                    "Losing all main generators leaves the aircraft on emergency power" + (" from the RAT and batteries." if f["rat"] else " from the battery and the APU.")])]
    out += [("h", "Fire protection"),
            ("p", f"Each engine and the APU have dual-loop fire detection and fire extinguishing bottles. "
                  f"{'Each engine has two agents; the APU has one.' if ab else 'Two bottles serve the engines and one bottle serves the APU.'} "
                  "Cargo compartments have smoke detection and a suppression system. Lavatories have smoke detectors and automatic waste-bin extinguishers.")]
    out += [("h", "Flight controls"),
            ("p", f["fbw_note"] + " " + (
                "Normal law protects against high angle of attack, overspeed, excessive bank (67°) and excessive pitch. Each sidestick "
                "input commands a rate of turn or a load factor; when released, the aircraft holds its attitude." if (ab and f.get("sidestick")) or fam == "A220" else
                ("Normal mode protects against stall, overspeed and excessive bank, while keeping a conventional feel." if f.get("law") else
                 "The stabilizer is the main pitch trim. Use small, frequent trim inputs. The rudder has a yaw damper."))),
            ("t", ["Setting", "Max speed (kt)"], [(a, str(s)) for a, s in f["flaps"]])]
    out += [("h", "Fuel"),
            ("p", f"Usable fuel is about {v['fuel_l']:,} litres (about {v['fuel_kg']:,} kg). Fuel is held in the wing tanks and a centre tank"
                  + (", with trim and extra tanks on some variants" if f["widebody"] else "") +
                  ". Each engine is fed from its own side; a crossfeed valve lets one side feed either engine. "
                  "Centre tank fuel is used first, then the wing tanks." +
                  (" Fuel jettison is available to reduce weight before an early landing." if f["widebody"] else ""))]
    out += [("h", "Hydraulics"), ("p", f["hyd_note"])]
    out += [("h", "Displays and instruments"),
            ("p", "Each pilot has a PFD (primary flight display) and ND (navigation display). The centre displays show engine indications "
                  f"and the {f['alert']} alerts, and system pages. Standby instruments give attitude, altitude and speed if the main displays fail.")]
    out += [("h", "Landing gear and brakes"),
            ("p", "Tricycle landing gear, hydraulically retracted and extended, with a gravity or alternate extension system. "
                  "Carbon brakes with antiskid and autobrake. Autobrake has takeoff (RTO or MAX) and landing settings (LO, MED, or 1, 2, 3, MAX). "
                  "Nose-wheel steering is controlled by the tiller on the ground and by the rudder pedals at low speed.")]
    out += [("h", "Navigation"),
            ("p", "Two (or three) inertial reference systems with GPS update give position. The FMS computes the route and performance. "
                  "Radio navigation: VOR, DME, ILS and (on newer aircraft) GLS. Weather radar, TCAS and terrain warning (EGPWS) are fitted.")]
    out += [("h", "APU"),
            ("p", (f"The {f['apu']} supplies electrical power" + (" and bleed air" if bleed else "") +
                   " on the ground and as a backup in flight. It starts from the battery. Allow about 1 to 2 minutes for it to start and become available. "
                   "After using APU bleed, let the APU run for about 1 to 2 minutes before shutting it down (cooling).") if f["apu"] else
                  f.get("hotel", "No APU is fitted.") + " Use external power when it is available.")]
    out += [("h", "Engines"),
            ("p", f"{f['engines']} x {v['engine']}. The engines are controlled by FADEC (full authority digital engine control), "
                  "which sets the thrust for the lever position, protects the limits and runs the start sequence automatically on most aircraft. "
                  "Watch the start: N2 (or N3), fuel flow, EGT rise and oil pressure."),
            ("t", ["Phase", "Power setting"], [("Takeoff", "Takeoff power (TO / RTO), propellers at 100%"), ("Climb", "Climb power, propellers at climb RPM"),
                                               ("Cruise", "Cruise power, propellers at cruise RPM"), ("Approach", "Set manually (autothrottle if fitted)"),
                                               ("Reverse", "Ground idle or reverse on landing, ground idle by about 60 kt")]) if f.get("turboprop") else
            ("t", ["Phase", "Thrust setting"], [("Takeoff", "FLEX / derated (reduced) thrust when performance allows, else TOGA / full"),
                                                 ("Climb", "CLB / climb thrust, reduced climb on light aircraft"),
                                                 ("Cruise", "Set by the autothrust for the cruise speed"),
                                                 ("Approach", "Autothrust in speed mode"),
                                                 ("Reverse", "Idle or maximum reverse on landing, idle by about 70 kt")])]
    return out


def normal(v):
    f = v["f"]
    ab = _is_ab_style(v)
    flaps_to = f["flap_to"]
    flaps_ld = f["flap_land"]
    return [
        ("p", "Use these flows from memory, then confirm with the normal checklist at the end of this chapter. Times are for a normal turnaround."),
        ("h", "1. Preliminary cockpit preparation (about 45 min before departure)"),
        ("flow", [("Battery / external power", "ON / connect"), ("APU", "START (if no ground air or power)"),
                  ("Aircraft documents / technical log", "Check"), ("Oxygen, fire extinguishers, escape ropes", "Check"),
                  ("Parking brake / chocks", "Set / in place"), ("Fuel quantity", "Check against the flight plan")]),
        ("h", "2. Cockpit preparation"),
        ("flow", [("Overhead panel", "Scan top to bottom, left to right"), ("IRS / ADIRS", "NAV, align (about 7-10 min)"),
                  ("FMS", "Load route, performance, weights and fuel (or import from SimBrief with NAVDECK EFB)"),
                  ("Takeoff performance", "Compute: flaps " + "/".join(flaps_to) + ", flex/derate, V1 / VR / V2"),
                  ("Radios and navaids", "Set for the departure"), ("Departure briefing", "Complete")]),
        ("h", "3. Before start"),
        ("flow", [("Doors", "Closed"), ("Beacon", "ON"), ("Fuel pumps", "ON"), ("Transponder", "As required"),
                  ("Pushback clearance", "Obtained"), ("Before start checklist", "Complete")]),
        ("h", "4. Engine start"),
        ("p", f"Start the engines in the order your operator uses (often engine {'2 then 1' if ab else '2 then 1 (right then left)'}). "
              "Monitor every start: rotation, light-off within about 10-15 s of fuel, EGT peak within limits, oil pressure rising, stabilised idle."),
        ("flow", ([("Start selector / ignition", "START / ON"), (f["v_start"][0] + " (one engine)", f["v_start"][1]), ("Start sequence", "Monitor"),
                   ("Next engine", "Repeat"), ("Start selector / ignition", "OFF / NORM")] if f.get("v_start") else
                  [("ENG MODE selector", "IGN / START"), ("ENG MASTER (one engine)", "ON"), ("Start sequence", "Monitor"),
                   ("Second engine", "Repeat"), ("ENG MODE selector", "NORM")] if ab and v["family"] != "A220" else
                  [("Engine start switch / selector", "GND / START"), (("Engine start lever" if v["family"] == "737" else "Fuel control switch / ENG RUN"), "IDLE / RUN at the correct N2 (typically 25%)"),
                   ("Start", "Monitor; switch off automatically at about 56% N2"), ("Second engine", "Repeat")])),
        ("h", "5. After start and taxi"),
        ("flow", [("APU bleed / APU", "OFF (when no longer needed)"), ("Anti-ice", "As required"),
                  ("Flaps", "Set for takeoff: " + "/".join(flaps_to)), ("Flight controls", "Check full and free"),
                  ("Autobrake", "RTO / MAX"), ("Taxi clearance", "Obtained, taxi lights ON"),
                  ("Before takeoff checklist", "Complete")]),
        ("h", "6. Takeoff"),
        ("ul", ["Line up, check the heading against the runway, set the brake lights and strobes.",
                "Set thrust to about 50% N1, check stable, then set takeoff thrust (" + ("FLX or TOGA detent" if ab else "TO/GA, autothrottle") + ").",
                "PM calls '100 knots' (or '80 knots'), 'V1', 'Rotate'. Rotate smoothly at about 2-3° per second to about 15°.",
                "Positive climb: gear up. At acceleration altitude: lower the nose, retract flaps on schedule.",
                "Use NAVDECK EFB: the gate-out, takeoff and wheels-up times are logged automatically from FSUIPC."]),
        ("h", "7. Climb"),
        ("ul", ([f"Climb at about {f['perf']['climb_low']} below FL100 and {f['perf']['climb_high']} above.",
                 "Above FL100: landing lights OFF, signs as required. Set climb power and keep an eye on ITT and torque."] if f.get("perf") else
                ["Climb at 250 kt below FL100, then at the climb speed (typically 290-310 kt) until the crossover to Mach.",
                 f"Above FL100: landing lights OFF, signs as required. Typical climb Mach is {climb_mach(f)}."]) + [
                "Check fuel against the plan at top of climb. NAVDECK EFB records fuel at each waypoint."]),
        ("h", "8. Cruise"),
        ("ul", [f"Typical cruise speed {cruise(f)} or cost-index speed.",
                "Step climb when about 2,000-4,000 ft below optimum altitude and the weight allows.",
                "Check fuel every 30 min or at each waypoint: actual versus planned, and the fuel at destination.",
                "Watch the weather radar and plan diversions. Get the destination weather and ATIS before the descent."]),
        ("h", "9. Descent preparation and descent"),
        ("ul", ["About 100 nm before top of descent: brief the arrival, approach, missed approach and taxi-in.",
                "Set the approach in the FMS, landing minimums, autobrake and landing flaps (" + "/".join(flaps_ld) + ").",
                "Descent rule of thumb: 3 nm per 1,000 ft to lose, plus 1 nm per 10 kt to slow down.",
                "Below FL100: 250 kt or less" + (f" ({f['perf']['descent']} is typical)" if f.get("perf") else "") + ", landing lights ON."]),
        ("h", "10. Approach and landing"),
        ("ul", ["Decelerate and configure in time to be stable by 1,000 ft (instrument) or 500 ft (visual):",
                "on the final path, landing configuration, speed between VAPP and VAPP+10, thrust stabilised, landing checklist done.",
                "If not stable: go around.",
                "Flare at about 20-30 ft" + (" ('RETARD' callout at 20 ft)" if ab else "") + ", touch down in the touchdown zone, aim for 100-300 fpm.",
                "NAVDECK EFB records the landing rate, G-force and touchdown point."]),
        ("h", "11. Go-around"),
        ("flow", [("Thrust", "TOGA / TO/GA"), ("Pitch", "About 15°, follow the flight director"),
                  ("Flaps", "Retract one step"), ("Positive climb", "Gear up"),
                  ("Missed approach", "Fly it; tell ATC"), ("NAVDECK EFB", "Enter the go-around reason before closing the flight")]),
        ("h", "12. After landing, parking and securing"),
        ("flow", [("Spoilers / speedbrakes", "Retract"), ("Flaps", "UP"), ("APU", "START"), ("Strobes / landing lights", "OFF"),
                  ("Parking brake", "SET at the gate"), ("Engines", "Shut down (cutoff)"), ("Beacon", "OFF when engines stopped"),
                  ("Fuel pumps", "OFF"), ("NAVDECK EFB", "Check times, sign and close the flight")]),
        ("h", "Normal checklist"),
        ("t", ["Phase", "Items"], [
            ("Before start", "Cockpit prep complete, fuel checked, signs ON, ADIRS / IRS NAV, takeoff speeds set, beacon ON"),
            ("After start", "Anti-ice as required, " + ("ECAM status checked, pitch trim set" if ab else "generators ON, probe heat ON, stabilizer trim set") + ", flaps set"),
            ("Before takeoff", "Flight controls checked, flaps " + "/".join(flaps_to) + ", takeoff briefing confirmed, transponder TA/RA, cabin ready"),
            ("After takeoff", "Gear UP, flaps UP, " + ("APU off, packs ON" if v["family"] != "787" else "APU off") + ", altimeters set at transition"),
            ("Approach", "Briefing done, altimeters set, minimums set, landing elevation checked"),
            ("Landing", "Gear DOWN, flaps " + "/".join(flaps_ld) + ", speedbrakes armed, autobrake set, cabin ready"),
            ("Parking", "Parking brake SET, engines OFF, fuel pumps OFF, beacon OFF"),
            ("Securing", "IRS OFF, emergency exit lights OFF, battery OFF")])]


def supplementary(v):
    f = v["f"]
    out = [
        ("h", "Cold weather"),
        ("ul", ["De-icing: engines at idle or off, packs off, APU bleed off during spraying. Note the holdover time.",
                "Taxi slowly on contaminated surfaces; keep the flaps up until de-iced if slush is present.",
                "Use engine anti-ice in icing conditions; run up the engines as recommended to shed ice on long taxis.",
                "Cold temperature corrections: add altitude to minimum altitudes when the temperature is well below ISA."]),
        ("h", "Hot weather and high airports"),
        ("ul", ["Use external air or the APU early to cool the cabin.", "Expect higher takeoff speeds and longer runways at high altitude.",
                "Watch brake temperatures before departure after a short turnaround."]),
        ("h", "Adverse weather"),
        ("ul", ["Thunderstorms: avoid by 20 nm laterally, more downwind of the cell. Do not fly under an anvil.",
                "Turbulence: fly the turbulence penetration speed and allow the altitude to vary.",
                "Windshear: delay takeoff or approach when windshear is reported or predicted.",
                "Wet or contaminated runway: use the right landing distance factor and a firm touchdown."]),
        ("h", "RVSM"),
        ("ul", ["Two primary altimeters within 200 ft, autopilot with altitude hold, transponder reporting altitude, altitude alert.",
                "Report to ATC if any of these are lost, and expect to leave RVSM airspace."]),
        ("h", "Fuel policy (simulator guide)"),
        ("t", ["Component", "Typical amount"], [("Taxi", "200-600 kg (more on wide-bodies)"), ("Trip", "From the flight plan"),
                                                 ("Contingency", "5% of trip, at least 5 minutes"), ("Alternate", "Missed approach, climb, cruise and approach to the alternate"),
                                                 ("Final reserve", "30 minutes holding at 1,500 ft above the alternate"),
                                                 ("Extra / discretionary", "Captain's decision (weather, delays)")]),
    ]
    if f["etops"]:
        out += [("h", "ETOPS / EDTO"),
                ("p", "Twin-engine long-range flights over water or remote areas use ETOPS (EDTO) rules. "
                      "The route must stay within the approved diversion time (for example 120, 180 or more minutes) from a suitable airport at one-engine-inoperative speed."),
                ("ul", ["Plan en-route alternates and check their weather for the time you may need them.",
                        "Compute the critical fuel scenario (engine failure and depressurisation at the critical point).",
                        "Check the APU and both engines' oil levels; keep the APU available as required."])]
    return out


def performance(v):
    f = v["f"]
    vref_full = v["vref"]
    return [
        ("note", "Simulator rule-of-thumb figures only. Use your add-on's FMS, a performance calculator or SimBrief for real numbers."),
        ("h", "Typical profile"),
        ("t", ["Phase", "Speed", "Notes"], [
            ("Climb below FL100", f["perf"]["climb_low"] if f.get("perf") else "250 kt", "ATC speed limit 250 kt"),
            ("Climb above FL100", f["perf"]["climb_high"] if f.get("perf") else "290-310 kt then " + climb_mach(f), "or cost-index speed"),
            ("Cruise", f["perf"]["cruise"] if f.get("perf") else f"M{f['cruise_mach']:.2f}", "LRC / cost-index"),
            ("Descent", f["perf"]["descent"] if f.get("perf") else f"M{f['cruise_mach']:.2f} / 290-300 kt", "3 nm per 1,000 ft"),
            ("Holding", f["perf"]["hold"] if f.get("perf") else ("about 210-230 kt" if not f["widebody"] else "about 230-250 kt"), "Minimum clean / maneuvering speed"),
            ("Final approach", f"VREF about {vref_full} kt at MLW", "add wind correction (half the headwind plus all the gust, max +15/20 kt)")]),
        ("h", "Fuel planning (rough)"),
        ("t", ["Item", "Typical value"], [("Cruise fuel flow", f"about {v['burn']:,} kg/h total"),
                                          ("Climb (to cruise level)", f"about {round(v['burn'] * 0.6, -1):,.0f} kg extra over cruise"),
                                          ("Holding (30 min)", f"about {round(v['burn'] * 0.45, -1):,.0f} kg"),
                                          ("Taxi (per 10 min)", f"about {round(v['burn'] * 0.07 , -1):,.0f} kg"),
                                          ("Range at typical load", f"about {v['range']:,} nm")]),
        ("h", "Takeoff flaps"),
        ("p", f"Common takeoff settings: {', '.join(f['flap_to'])}. Use a lower setting on long runways for a better climb, and a higher setting on short or high-altitude runways."),
        ("h", "Landing flaps"),
        ("p", f"Common landing settings: {', '.join(f['flap_land'])}. Use full flap for short or contaminated runways; the reduced setting saves fuel and noise."),
        ("h", "Landing rate guide"),
        ("t", ["Vertical speed at touchdown", "Assessment"], [("0-60 fpm", "Very soft: may float, use more of the runway"),
                                                              ("60-240 fpm", "Good"), ("240-400 fpm", "Firm"),
                                                              ("400-600 fpm", "Hard: report in the log"), ("Over 600 fpm", "Hard landing inspection")]),
    ]


def efb(v):
    return [
        ("p", f"NAVDECK EFB is built to fly with the {v['title']} in your simulator."),
        ("ul", ["Import your SimBrief flight plan: route, weights, fuel and times fill in automatically.",
                "With FSUIPC running, the EFB records gate out, takeoff, landing and gate in times, and the fuel on board at each waypoint against the plan.",
                "The landing tab shows the landing rate, G-force and a touchdown plot on the runway.",
                "If you go around, the EFB asks for the reason before you can sign and close the flight.",
                "Sign the flight to create the journey log PDF. It is posted to the NAVDECK Discord automatically.",
                "This FCOM and the QRH are in the Documents tab, filed by aircraft family."])]


CHAPTERS = [
    ("General", general),
    ("Limitations", limitations),
    ("Aircraft systems", systems),
    ("Normal procedures", normal),
    ("Supplementary procedures", supplementary),
    ("Performance and planning guide", performance),
    ("Using NAVDECK EFB", efb),
]
