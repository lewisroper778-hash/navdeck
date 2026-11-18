"""Original NAVDECK simulator QRH content.

Written for flight simulation in NAVDECK's own words, following general airline practice.
It is not a copy of any manufacturer or operator QRH.

A checklist step is one of:
  ("Item", "ACTION")   challenge and response
  "!text"              caution or note
  "?text"              condition (If ... :)
  ">text"              go to / reference
  "-text"              plain instruction line
"""


def vocab(f, v):
    fam = v["family"]
    airbus = f["maker"] == "Airbus" and fam != "A220"
    if fam == "A220":
        cut, cut_a, fire, fire_a, agent = "ENG RUN switch (affected)", "OFF", "ENG FIRE pushbutton (affected)", "PUSH", "FIRE BOTTLE"
    elif airbus:
        cut, cut_a, fire, fire_a, agent = "ENG MASTER (affected)", "OFF", "ENG FIRE pushbutton (affected)", "PUSH", "AGENT"
    elif fam == "737":
        cut, cut_a, fire, fire_a, agent = "Engine start lever (affected)", "CUTOFF", "Engine fire switch (affected)", "PULL", "Discharge"
    else:
        cut, cut_a, fire, fire_a, agent = "FUEL CONTROL switch (affected)", "CUTOFF", "Engine fire switch (affected)", "PULL", "Discharge"
    if f.get("v_cut"):
        cut, cut_a = f["v_cut"]
    if f.get("v_fire"):
        fire, fire_a = f["v_fire"]
    thr, thr_a = f.get("v_thr") or (("THR LEVER (affected)", "IDLE") if airbus or fam == "A220" else ("Thrust lever (affected)", "CLOSE"))
    return dict(
        airbus=airbus, fam=fam, cut=cut, cut_a=cut_a, fire=fire, fire_a=fire_a, agent=agent,
        thr=thr, thr_a=thr_a,
        at=("A/THR" if airbus or fam == "A220" else "Autothrottle"), at_off=("OFF" if airbus or fam == "A220" else "DISENGAGE"),
        ap=("AP" if airbus or fam == "A220" else "Autopilot"), ap_off=("OFF" if airbus or fam == "A220" else "DISENGAGE"),
        pm="PM", pf="PF", alert=f["alert"],
        toga=("TOGA" if airbus or fam == "A220" else "maximum thrust"),
        seatbelt=("SEAT BELTS signs" if airbus or fam == "A220" else "Passenger signs"),
        quad=f["engines"] == 4,
        eng_word=("both engines" if f["engines"] == 2 else "all engines"),
    )


def C(title, cond, steps, memory=False, tag=None):
    return dict(title=title, cond=cond, steps=steps, memory=memory, tag=tag)


def memory_items(f, v, w):
    out = []
    unreliable = (
        [("AP / FD", "OFF"), ("A/THR", "OFF"), "-Set pitch and thrust:",
         ("Below thrust reduction altitude", "15° / TOGA"), ("Above thrust reduction alt, below FL100", "10° / CLB"),
         ("Above FL100", "5° / CLB"), ("FLAPS", "keep current setting"), ("SPEEDBRAKES", "RETRACT"),
         ("Landing gear", "UP (when safely airborne)")]
        if w["airbus"] or w["fam"] == "A220" else
        [("Autopilot", "DISENGAGE"), ("Autothrottle", "DISENGAGE"), ("F/D switches (both)", "OFF"),
         "-Set pitch and thrust:", ("Flaps extended", "10° and 80% N1"), ("Flaps up", "4° and 75% N1")])
    out.append(C("Unreliable airspeed", "Airspeed or Mach is suspected to be wrong, or speed indications disagree.",
                 unreliable + ["!Do not chase the speed tape. Fly attitude and thrust, then use the remaining steps in Navigation and instruments."], memory=True))
    if not (w["airbus"] or w["fam"] == "A220"):
        out.append(C("Rejected takeoff", "Takeoff is rejected at or below V1.", [
            ("Thrust levers", "CLOSE"), ("Autothrottle", "DISENGAGE"), ("Brakes", "Maximum manual, or verify RTO autobrake"),
            ("Speedbrake lever", "UP"), ("Reverse thrust", "Maximum consistent with directional control"),
            "!Above 80 kt reject only for fire, engine failure, predictive windshear, or if the aircraft is unsafe or unable to fly."], memory=True))
    else:
        out.append(C("Rejected takeoff", "Captain calls STOP at or below V1.", [
            ("Thrust levers", "IDLE"), ("Reverse thrust", "MAX"), ("Brakes", "Monitor autobrake MAX / apply full manual braking"),
            "-When stopped: PARKING BRAKE ON, notify ATC, call for the evacuation checklist if needed.",
            "!Above 100 kt reject only for fire, sudden loss of thrust, a predictive windshear warning, or if the aircraft is unsafe or unable to fly."], memory=True))
    out.append(C("Stall recovery", "Stall warning, buffet, or stick shaker, at any time.", [
        (w["ap"] + " and " + w["at"], "OFF / DISENGAGE"), ("Pitch", "Nose down until the stall warning stops (reduce angle of attack)"),
        ("Bank", "Wings level"), ("Thrust", "As needed"), ("Speedbrakes", "RETRACT"),
        "-When out of the stall: recover to the target speed and flight path, and check the configuration.",
        "!Near the ground the same nose-down action comes first; only then add thrust and climb."], memory=True))
    out.append(C("Windshear", "Windshear warning, or windshear encountered during takeoff or approach.", [
        ("Thrust", w["toga"].upper() if w["airbus"] or w["fam"] == "A220" else "Push TO/GA, maximum thrust"),
        ("Pitch", "Follow the flight director or windshear guidance; up to stick shaker if needed" if not w["airbus"] else "Follow SRS orders; full back stick if needed"),
        ("Roll", "Wings level"), ("Configuration", "Do not change gear or flaps until out of windshear"),
        ("Speedbrakes", "RETRACT"), "!Before V1 on the runway: reject the takeoff if there is enough runway."], memory=True))
    out.append(C("Terrain / pull up warning", "Terrain warning, pull up, or terrain ahead alert at night or in cloud.", [
        (w["ap"], w["ap_off"]), ("Pitch", "Pull up firmly (full back stick on fly-by-wire)" if f.get("law") else "Pull up to stick shaker or initial buffet"),
        ("Thrust", "Maximum"), ("Speedbrakes", "RETRACT"), ("Bank", "Wings level"),
        "-Keep climbing until the warning stops and terrain clearance is assured."], memory=True))
    out.append(C("TCAS resolution advisory", "TCAS RA: climb, descend, adjust vertical speed.", [
        (w["ap"] + " / FD", "OFF (or engage the TCAS mode if fitted)"), ("Vertical speed", "Fly into the green, out of the red"),
        "!Follow the RA even if ATC instructs otherwise. Do not manoeuvre against it.",
        "-When clear of conflict: tell ATC, return to the clearance, re-engage automatics."], memory=True))
    if w["airbus"]:
        out.append(C("Emergency descent", "Cabin altitude cannot be controlled, or rapid decompression.", [
            ("Crew oxygen masks", "ON"), ("SIGNS", "ON"), ("Emergency descent", "INITIATE"),
            "-ALT selector: set target (FL100 or minimum safe altitude), PULL. HDG: PULL as needed.",
            ("SPEED", "MAX / APPROPRIATE"), ("SPEEDBRAKES", "FULL"), ("A/THR", "Check active, thrust IDLE"),
            ("ATC / squawk", "Notify / 7700")], memory=True))
        out.append(C("Loss of braking", "No braking when the pedals are pressed after landing.", [
            ("REV", "MAX"), ("Brake pedals", "RELEASE"), ("A/SKID & N/W STRG", "OFF"),
            ("Brake pedals", "PRESS (limit to about 1000 psi)"), ("Parking brake", "Short, successive applications if still no braking")], memory=True))
    else:
        out.append(C("Cabin altitude warning / rapid depressurisation", "Cabin altitude warning or rapid loss of cabin pressure.", [
            ("Oxygen masks and regulators", "ON, 100%"), ("Crew communication", "ESTABLISH"),
            ("Pressurisation mode", "MANUAL, outflow valve CLOSE" if w["fam"] in ("737", "757", "767") else "Outflow valves: MANUAL, CLOSE"),
            "?If cabin altitude is not controllable:", ("Emergency descent", "START (see Air chapter)")], memory=True))
        out.append(C("Engine fire, severe damage or separation", "Fire warning, airframe vibration with abnormal engine indications, or engine separation.", [
            (w["at"] + " (if engaged)", w["at_off"]), (w["thr"], w["thr_a"]), (w["cut"], w["cut_a"]),
            (w["fire"], w["fire_a"]), "?If the fire warning stays on:", (w["fire"], "Rotate to the stop and hold 1 second"),
            ">Then: Engine fire remaining steps (Engines and APU chapter)."], memory=True))
        out.append(C("Aborted engine start", "Abnormal start: no light-off, hot start, hung start, no oil pressure.", [
            (w["cut"].replace(" (affected)", ""), "CUTOFF"), ">Then: Aborted engine start remaining steps."], memory=True))
        out.append(C("Dual engine failure", "Both engines have failed or flamed out.", [
            ("Engine start switches", "FLT / CONT" if w["fam"] == "737" else "CONT"),
            (w["cut"].replace(" (affected)", "es (both)" if w["cut"].endswith("switch (affected)") else "s (both)"), "OFF, then ON" if w["cut_a"] == "OFF" else ("CUTOFF, then IDLE" if w["fam"] == "737" else "CUTOFF, then RUN")),
            ("Ram air turbine", "DEPLOY") if f["rat"] else ("APU", "START (below 25,000 ft)"),
            "-Fly best glide speed (clean, about 220-240 kt) and work the relight procedure."], memory=True))
    if w["fam"] == "737":
        out.append(C("Runaway stabilizer", "Uncommanded stabilizer trim movement continues.", [
            ("Control column", "Hold firmly"), ("Autopilot (if engaged)", "DISENGAGE"), ("Autothrottle (if engaged)", "DISENGAGE"),
            "?If the runaway continues:", ("STAB TRIM CUTOUT switches (both)", "CUTOUT"),
            "?If the runaway still continues:", ("Stabilizer trim wheel", "Grasp and hold"),
            ">Then: trim manually with the trim wheels for the rest of the flight."], memory=True))
    return out


def engines_apu(f, v, w):
    eng = []
    eng.append(C("Engine failure or shutdown in flight", "Engine failure, flameout or a precautionary shutdown.", [
        (w["at"], w["at_off"] if not (w["airbus"] or w["fam"] == "A220") else "Leave on (adjusts thrust)"),
        (w["thr"], w["thr_a"]), (w["cut"], w["cut_a"]),
        "?If there are signs of damage or fire:", ">Engine fire checklist.",
        "?If no damage and the engine may relight:", ">Engine relight in flight (consider before the APU start).",
        ("APU", "START (if available)"), ("Transponder / ATC", "Notify, declare an emergency if needed"),
        ("Fuel", "Monitor balance; crossfeed as needed"),
        ("Drift down / single-engine speed", "Set" if not w["quad"] else "Set; consider altitude with three engines"),
        "-Plan to land at the nearest suitable airport." + (" With three engines working the flight may continue; follow company policy." if w["quad"] else ""),
        ">One engine inoperative approach and landing."]))
    eng.append(C("Engine fire (remaining steps)", "Engine fire warning in flight.", [
        (w["thr"], w["thr_a"]), (w["cut"], w["cut_a"]), (w["fire"], w["fire_a"]),
        ("First " + ("agent" if w["airbus"] else "fire bottle"), "DISCHARGE (after about 10 s on Airbus, at once on Boeing)"),
        ("ATC", "Notify, declare MAYDAY"),
        "?If the fire warning is still on after 30 seconds:", ("Second " + ("agent" if w["airbus"] else "fire bottle"), "DISCHARGE"),
        "?If the fire stays on:", "-Land at the nearest suitable airport without delay.",
        ">One engine inoperative approach and landing."]))
    eng.append(C("Engine fire on the ground", "Fire warning on the ground, engine running or starting.", [
        ("Thrust levers", "IDLE"), ("Aircraft", "STOP, PARKING BRAKE ON"), ("ATC / cabin", "Notify"),
        (w["cut"].replace(" (affected)", " (both)"), w["cut_a"]), (w["fire"], w["fire_a"]),
        ("Fire " + ("agents" if w["airbus"] else "bottles"), "DISCHARGE (both)"),
        ">Evacuation checklist if the fire is not extinguished."]))
    eng.append(C("Engine relight in flight", "An engine has flamed out and there is no sign of damage.", [
        ("Engine start / ignition", "ON / CONT"), (w["cut"], "OFF / CUTOFF for 30 s, then ON / RUN"),
        "-Windmill relight: typically below FL300 with enough airspeed to keep N2 turning (about 280-300 kt).",
        "-Starter-assisted relight: typically below FL200 with the APU bleed or a crossbleed source.",
        "?If no light-off within 30 s, or EGT rises fast:", (w["cut"], w["cut_a"]),
        "!Allow 30 s of dry motoring before another attempt."]))
    eng.append(C("Aborted engine start (remaining steps)", "Start aborted on the ground.", [
        ("Start switch / mode selector", "OFF / NORM"), "?If EGT was high (hot start):", "-Dry motor the engine for 60 s to cool it.",
        "?If there was a tailpipe fire:", "-Motor the engine to blow out the fire. Do not use the fire extinguisher.",
        "-Log the fault. Wait the starter cooling time before another attempt."]))
    eng.append(C("Engine overtemperature (EGT high)", "EGT at or above the red line, or rising fast.", [
        ("Thrust lever (affected)", "Retard until EGT is within limits"),
        "?If EGT cannot be kept within limits:", ">Engine failure or shutdown in flight."]))
    eng.append(C("Engine oil pressure low", "Oil pressure at or below the red line.", [
        (w["thr"], w["thr_a"]), "?If oil pressure stays at or below the red line:", (w["cut"], w["cut_a"]),
        ">Engine failure or shutdown in flight."]))
    eng.append(C("Engine vibration high", "Vibration above the advisory level.", [
        ("Thrust lever (affected)", "Retard to keep vibration below the limit"),
        "-In icing, briefly increase thrust to shed ice, as conditions allow.",
        "?If vibration stays high with other abnormal indications:", ">Engine failure or shutdown in flight."]))
    eng.append(C("Engine stall / surge", "Bangs, flames, fluctuating parameters or EGT rise.", [
        (w["at"], w["at_off"] if not w["airbus"] else "OFF"), ("Thrust lever (affected)", "Retard slowly to IDLE"),
        "-Check parameters stabilise, then advance the thrust lever slowly.",
        "?If the stall recurs or parameters are abnormal:", (w["thr"], w["thr_a"]),
        "-Run the engine at idle or shut it down if damage is suspected."]))
    eng.append(C("APU fire", "APU fire warning.", [
        ("APU fire " + ("pushbutton" if w["airbus"] or w["fam"] == "A220" else "switch"), "PUSH / PULL and rotate"),
        ("APU fire " + ("agent" if w["airbus"] else "bottle"), "DISCHARGE"), ("APU master switch", "OFF"),
        "-On the ground: tell the ground crew and ATC. Evacuate if the fire is not out."]))
    eng.append(C("One engine inoperative approach and landing", "One engine shut down or at idle.", [
        ("Landing flaps", f["flap_land"][0] + " (reduced setting)"),
        ("Approach speed", "VREF / VLS for the chosen flaps plus wind correction"),
        ("Autobrake", "As required"), ("Go-around", "Brief: single-engine thrust, rudder, acceleration altitude"),
        "-Use rudder trim to centre the controls. Expect more rudder as thrust changes.",
        "-Thrust reverse: on the working engine only, smoothly." + (" With two engines on one side inoperative, use symmetric reverse only." if w["quad"] else "")]))
    if w["quad"]:
        eng.append(C("Two engines inoperative (same side)", "Two engines on the same side have failed.", [
            ("Rudder trim", "As required"), ("Speed", "Not below VMCL-2 + margin"),
            ("Landing flaps", "3"), ("Approach", "Long, stabilised, gear down late but by 1000 ft"),
            "!Go-around may not be possible below a certain height: brief a decision height.",
            "-Use reverse only on the working engines if directional control is assured."]))
    return eng


def fire_smoke(f, v, w):
    return [
        C("Smoke, fire or fumes", "Smoke, fire or fumes in the cockpit or cabin.", [
            ("Oxygen masks", "ON, 100%"), ("Crew communication", "ESTABLISH"),
            ("Recirculation fans", "OFF"), ("Cabin crew", "Notify, find and fight the source"),
            ("Diversion", "Consider immediately"),
            "-Remove power from the suspected source if known (galley, in-flight entertainment, equipment cooling).",
            "?If smoke or fumes become the greatest threat:", ">Smoke or fumes removal.",
            "?If the source cannot be found and the smoke continues:", "-Land at the nearest suitable airport. Consider an emergency descent."]),
        C("Smoke or fumes removal", "Smoke in the cockpit must be cleared.", [
            ("Oxygen masks", "ON"), ("Pack flow / packs", "HIGH, then one pack OFF if instructed"),
            ("Outflow valve / cabin altitude", "Raise cabin altitude to about 10,000 ft (descend below FL100)"),
            "-On the ground or below 10,000 ft with a safe speed: consider opening the cockpit window (if certified).",
            ">Landing as soon as possible."]),
        C("Avionics or electrical smoke", "Avionics smoke warning or electrical burning smell.", [
            ("Oxygen masks", "ON"), ("Equipment cooling", "Override / BLOWER and EXTRACT as required"),
            ("Non-essential electrical loads", "OFF (galley, cabin entertainment)"),
            "?If smoke continues:", "-Consider shedding power down to the emergency configuration.",
            "-Land at the nearest suitable airport."]),
        C("Cargo smoke", "Cargo compartment smoke detection.", [
            ("Cargo fire " + ("agent / DISCH" if w["airbus"] else "arm switch, then DISCH"), "PUSH / ARM, then DISCHARGE"),
            ("Cargo air / isolation valves", "Check closed"), ("Diversion", "Land at the nearest suitable airport"),
            "!The extinguisher keeps the fire suppressed for a limited time (usually 60-195 min). Plan to be on the ground well within it.",
            "-After landing: keep the cargo doors closed until fire services arrive."]),
        C("Lavatory smoke", "Lavatory smoke detection.", [
            ("Cabin crew", "Check the lavatory, use a hand extinguisher if fire"), ("Lavatory", "Keep closed and out of use after the event"),
            "?If fire cannot be confirmed out:", "-Divert."]),
    ]


def air(f, v, w):
    bleed = v["family"] != "787"
    out = [
        C("Emergency descent (remaining steps)", "Cabin altitude cannot be controlled.", [
            ("Passenger signs / oxygen", "ON / deploy manually if cabin altitude is above 14,000 ft"),
            ("Altitude selector", "Lowest safe altitude, FL100 or MEA/MORA"), ("Heading", "Turn off the airway if needed"),
            ("Thrust levers", "IDLE"), ("Speedbrakes", "FULL / FLIGHT DETENT"),
            ("Speed", "MMO / VMO, or lower if structural damage is suspected"), ("ATC / squawk", "Notify, 7700"),
            "-Level off at the target altitude, retract speedbrakes, consider fuel and range at low level."]),
        C("Pack fault / both packs off", "A pack fails, or both packs are lost.", [
            ("Affected pack", "OFF, then reset once if no overheat"),
            "?If both packs are lost:", ("Descent", "To FL100 or minimum safe altitude"),
            ("RAM air", "ON when below FL100 and differential pressure is low"),
            "-Expect slow cabin pressure loss. Monitor cabin altitude."]),
    ]
    if bleed:
        out.append(C("Bleed duct leak or overheat", "Bleed leak, duct overheat or wing/body overheat.", [
            ("Affected engine bleed", "OFF"), ("Crossbleed / isolation valve", "CLOSE"),
            ("APU bleed (if on the affected side)", "OFF"), ("Wing anti-ice on the affected side", "Avoid icing"),
            "-Monitor the overheat warning goes out. Plan the descent with the remaining bleed."]))
    else:
        out.append(C("Cabin air compressor fault", "One or more cabin air compressors fail.", [
            ("Affected compressor / pack", "OFF, then reset once"), "?If two or more compressors are lost:", "-Descend as needed to keep cabin altitude below 10,000 ft."]))
    out.append(C("Severe icing / anti-ice fault", "Anti-ice fails, or ice builds in severe icing.", [
        ("Engine anti-ice", "ON (check operating)"), ("Wing anti-ice", "ON"),
        "?If wing anti-ice has failed:", "-Leave icing conditions. Add 10-20 kt to approach speed and use a reduced landing flap if ice remains.",
        "-Expect higher landing distance (about 30-50% more)."]))
    return out


def electrical(f, v, w):
    return [
        C("Generator failure", "One engine or APU generator has failed.", [
            ("Generator (affected)", "OFF, then ON (reset once)"),
            "?If the generator does not reset:", ("Generator", "OFF"), ("APU", "START, APU generator ON (if available)"),
            ("IDG / drive (if overheat or low oil pressure)", "Disconnect" + (" (only when instructed by " + w["alert"] + ")")),
            "!Never disconnect a drive with the engine stopped. The disconnect cannot be reset in flight."]),
        C("Loss of all main generators", "Emergency electrical configuration.", [
            (w["ap"], "OFF if lost; fly manually"), ("RAT", "Check deployed / deploy" if f["rat"] else "Not fitted"),
            ("APU", "START (if below its start altitude)"), ("Speed", "Above the minimum RAT speed (about 140 kt) until landing gear down" if f["rat"] else "As required"),
            ("Battery time", "Typically 30-60 min on battery alone: land as soon as possible"),
            "-Reduce loads: one radio, essential displays only. Expect no autothrust and limited systems.",
            "?When the APU generator is online:", "-Restore loads progressively."]),
        C("Battery or DC bus fault", "A battery or DC bus fails.", [
            ("Battery (affected)", "OFF, then ON (reset once)"),
            "-Check which systems are lost on the " + w["alert"] + " status page and plan the approach around them."]),
    ]


def hydraulics(f, v, w):
    h = f["hyd"]
    fam = v["family"]
    out = [C("Single hydraulic system loss", f"Loss of pressure or quantity in one system ({', '.join(h)}).", [
        ("Engine / electric pumps (affected system)", "OFF if quantity is lost (avoid pump damage)"),
        ("Status / inoperative systems", "Review"),
        "-Expect: slower flaps or spoilers, longer landing distance, possible gear gravity extension.",
        "-Use the landing distance factor for the failure (Quick data chapter)."])]
    if fam == "737":
        out.append(C("Loss of systems A and B (manual reversion)", "Both main hydraulic systems lost.", [
            ("Standby hydraulics", "Check ON (rudder, leading edge)"), ("Flaps", "Alternate (electric) extension to 15"),
            ("Landing gear", "Manual extension"), ("Approach speed", "VREF15 + 5 kt minimum"),
            "-Control forces are high. Plan a long, straight-in approach. Use small, early trim inputs.",
            "-No nosewheel steering or autobrake. Use the alternate brakes / accumulator: limited applications."]))
    elif fam in ("A320", "A330", "A340"):
        out.append(C("Dual hydraulic failure", "Two hydraulic systems lost (G+B, G+Y or B+Y).", [
            ("PTU / RAT", "Check / deploy if Blue is lost and G or Y is low"),
            ("Approach", "Fly in alternate law; stabilise early, long final"),
            ("Landing gear", "Gravity extension if Green is lost"),
            ("Flaps / slats", "Configuration and speed as per the " + w["alert"] + " landing data"),
            "-Expect direct law after gear extension, no autopilot, no reversers on the affected side, long landing distance."]))
    elif fam in ("A350",):
        out.append(C("Dual hydraulic failure (G+Y)", "Both hydraulic systems lost.", [
            ("Flight controls", "Electrical backup actuators take over; fly in alternate law"),
            ("Landing gear", "Gravity extension"), ("Approach speed", "As per the " + w["alert"] + " landing data"),
            "-Expect no spoilers, no reversers and a long landing distance."]))
    elif fam == "A220":
        out.append(C("Dual hydraulic failure", "Two of the three systems lost.", [
            ("RAT", "Check deployed if system 3 is affected"), ("Flight controls", "Check mode; direct mode possible"),
            ("Landing gear", "Alternate extension"), "-Plan a long, stabilised approach with extra speed as given in the landing data."]))
    else:
        out.append(C("Dual hydraulic failure", "Two hydraulic systems lost.", [
            ("RAT", "Check / deploy (powers Center)"), ("Landing gear", "Alternate extension"),
            ("Flaps", "Alternate (electric) extension to the setting available"),
            ("Approach speed", "VREF for the flap setting + additive (Quick data)"),
            "-Expect: no autobrake, reduced spoilers, no nose-wheel steering, long landing distance."]))
    return out


def flight_controls(f, v, w):
    fam = v["family"]
    flaps = " / ".join(a for a, _ in f["flaps"])
    out = [
        C("Flaps or slats jammed / asymmetry", "Flaps or slats fail to move, or move unequally.", [
            ("Flap lever", "Do not move again after an asymmetry"), ("Speed", "Below the limit for the current position"),
            ("Alternate flaps", "Use only if no asymmetry" if fam not in ("A320", "A330", "A340", "A350") else "Not available: flaps / slats are hydraulic only"),
            ("Approach speed", "VREF + additive from Quick data (typically +10 to +40 kt)"),
            ("Landing distance", "Apply the factor from Quick data"),
            f"-Normal flap settings: {flaps}. Use the next-best setting for go-around.",
            "-Flat approach, no flare-induced float; tailstrike risk at high nose attitude with slats retracted."]),
        C("Stabilizer / pitch trim inoperative", "Pitch trim fails or is jammed.", [
            (w["ap"], "OFF" if not (w["airbus"] or fam == "A220") else "Check (may disconnect)"),
            ("Trim", "Manual trim wheel" if fam in ("737", "757", "767", "A320", "A330", "A340") else "Alternate pitch trim switches"),
            "?If trim is jammed:", "-Keep the speed close to the speed at which it jammed. Plan landing flaps and speed with more column force.",
            "-Avoid large speed changes; configure early."]),
        C("Speedbrake / spoiler fault", "Spoiler fault or speedbrake does not extend.", [
            ("Speedbrake lever", "Down / retract"), ("Descent", "Plan earlier, use gear as drag if allowed"),
            ("Landing distance", "Apply the factor for spoilers inoperative")]),
    ]
    if f.get("law"):
        if w["airbus"] or fam == "A220":
            out.append(C("Flight control law degraded", "Alternate or direct law.", [
                ("Speed", "Keep within the normal envelope; protections are lost"),
                ("Bank angle / pitch", "Avoid large inputs; no bank or pitch limits"),
                "-Direct law: use manual pitch trim. 'USE MAN PITCH TRIM' on the PFD.",
                "-Alternate law reverts to direct law when the landing gear is extended.",
                "-Stall warning is active; overspeed warning is active."]))
        else:
            out.append(C("Primary flight computers secondary or direct", "Flight controls in secondary or direct mode.", [
                ("Autopilot", "Not available"), ("Envelope protection", "Lost: fly carefully near limits"),
                ("Approach speed", "VREF + 5 kt for flaps 30, or as noted"),
                "-Pitch feel and trim response differ. Use stabilizer trim as needed.",
                "-Expect higher roll sensitivity at low speed."]))
    return out


def gear_brakes(f, v, w):
    fam = v["family"]
    grav = "Landing gear gravity extension" if (w["airbus"] or fam == "A220") else "Manual / alternate gear extension"
    return [
        C(grav, "The landing gear does not extend normally.", [
            ("Speed", f"At or below {f['gear']['vle']} kt"), ("Landing gear lever", "DOWN" if (w["airbus"] or fam == "A220") else "OFF"),
            ("Gravity / alternate gear extension", "Operate (crank 3 turns / release switch / pull handle)"),
            ("Gear down indications", "Check three green"), "?If any gear is still not locked:", ">Landing with abnormal gear.",
            "-After gravity extension the gear cannot be retracted. Nose-wheel steering may be lost."]),
        C("Landing with abnormal gear", "One or more gear legs not down and locked.", [
            ("Fuel", "Burn off to reduce landing weight"), ("Cabin crew / ATC", "Brief for evacuation, request fire services"),
            ("Ground spoilers / speedbrakes", "Do not arm"), ("Autobrake", "OFF"),
            ("Engines", "Shut down before nacelles touch the ground (with nose or main gear missing)"),
            "-Touch down gently on the centreline. Hold the wing with the missing gear up as long as possible.",
            ">Evacuation when stopped."]),
        C("Landing gear does not retract", "Gear lever is up but gear stays down.", [
            ("Landing gear lever", "DOWN"), ("Speed", f"Below {f['gear']['vle']} kt"),
            "-Fuel burn with gear down rises by about 2.5 to 3 times. Recalculate fuel before continuing. Expect to return."]),
        C("Hot brakes / brake temperature high", "Brake temperature high after landing or a rejected takeoff.", [
            ("Parking brake", "Avoid setting it; chock the wheels"), ("Taxi", "Minimum braking"),
            ("Fire services", "Request after a high-energy stop"),
            "-Fusible plugs may release tyre pressure. Keep people away from the wheels."]),
        C("Antiskid inoperative", "Antiskid has failed.", [
            ("Autobrake", "OFF / not available"), ("Landing distance", "Apply the factor (Quick data)"),
            "-Touch down firmly, then apply brakes smoothly and progressively. Avoid locking wheels."]),
        C("Tyre failure on takeoff", "Tyre burst suspected during takeoff.", [
            ("Landing gear", "Leave DOWN (do not retract)"), ("ATC", "Ask for a runway inspection"),
            "-Land at a long runway, with fire services available. Use reverse and gentle braking."]),
    ]


def fuel(f, v, w):
    return [
        C("Fuel imbalance", "Fuel imbalance between tanks.", [
            ("Fuel leak", "Check first: compare fuel used with fuel on board"),
            ("Crossfeed", "OPEN"), ("Pumps (low side)", "OFF"),
            "-When balanced: pumps ON, crossfeed CLOSE."]),
        C("Fuel leak (suspected)", "Fuel quantity drops faster than burn, or fuel spray seen.", [
            ("Crossfeed", "CLOSE"), ("Fuel used vs fuel on board", "Compare every 15 min"),
            "?If the leak is from an engine:", (w["cut"], w["cut_a"]), ">Engine failure or shutdown in flight.",
            "?If the leak cannot be located:", "-Land at the nearest suitable airport."]),
        C("Low fuel", "Fuel at or below the low fuel level.", [
            ("Fuel pumps / crossfeed", "All tanks feeding"), ("ATC", "MINIMUM FUEL, then MAYDAY FUEL if final reserve will be used"),
            ("Approach", "Shortest route, no holding"), "!Avoid high nose-up attitude during go-around with low fuel."]),
        C("Fuel pump low pressure", "Fuel pump low pressure.", [
            ("Pump (affected)", "OFF"), ("Crossfeed", "As needed to keep both engines fed"),
            "-Above about FL300, suction feed may not keep up with high thrust. Descend if necessary."]),
    ]


def nav(f, v, w):
    return [
        C("Unreliable airspeed (remaining steps)", "After the memory items are complete.", [
            ("Flight path", "Stabilise; use pitch and thrust table in Quick data"),
            ("Air data sources", "Compare; switch to the unaffected source if one is reliable"),
            ("Probe / window heat", "ON"), ("GPS ground speed", "Cross-check with wind"),
            "-Use backup speed scale / angle of attack if available. Configure early for landing with a long, stable approach."]),
        C("Altitude disagree", "Altimeters disagree by more than 200 ft.", [
            ("Altimeter settings", "Check"), ("Standby altimeter", "Compare"),
            ("ATC", "Notify; RVSM not available"), "-Use the altitude source that agrees with the standby and GPS."]),
        C("Display unit failure", "A display unit fails or goes blank.", [
            ("Display selector / transfer", "Swap the failed display to another screen"),
            "-If both of a pilot's displays are lost, the other pilot flies."]),
        C("FMS / navigation failure", "FMC or FMS failure, or GPS lost.", [
            ("Navigation source", "Use the other FMS or raw data (VOR/DME/ILS)"),
            ("ATC", "Notify: unable RNAV / RNP if needed"), ("Approach", "Choose an approach with ground-based aids")]),
    ]


def misc(f, v, w):
    return [
        C("Overweight landing", "Landing above maximum landing weight.", [
            ("Fuel", "Jettison or burn off if time allows" + (" (fuel jettison fitted)" if f["widebody"] else "")),
            ("Landing flaps", "Full / landing flaps unless performance limited"),
            ("Approach", "Stabilised; reduce vertical speed at touchdown (aim below 360 fpm)"),
            ("Brakes", "Expect high brake temperatures"),
            "-After landing: maintenance inspection for overweight landing."]),
        C("Bird strike / volcanic ash", "Bird strike or volcanic ash suspected.", [
            "?Volcanic ash:", ("Autothrottle", "OFF"), ("Thrust", "Reduce to idle if possible; turn 180° out of the ash"),
            ("Engine and wing anti-ice / packs", "ON / HIGH"), ("Oxygen", "ON"),
            "?Bird strike:", "-Check engine parameters for vibration and EGT. Expect a return to land."]),
        C("Ditching", "Landing on water is unavoidable.", [
            ("ATC / squawk", "MAYDAY, 7700"), ("Cabin crew", "Prepare for ditching"),
            ("Ditching pushbutton / outflow valve", "ON / CLOSE"), ("Landing gear", "UP"),
            ("Flaps", "Landing flaps / FULL"), ("Touchdown", "Minimum vertical speed, pitch about 11°, parallel to the swell"),
            ">Evacuation after the aircraft stops."]),
        C("Forced landing", "Landing off airport is unavoidable.", [
            ("ATC / squawk", "MAYDAY, 7700"), ("Cabin crew", "Prepare for emergency landing"),
            ("Landing gear", "DOWN (on land)"), ("Fuel", "Reduce if time allows"),
            ("Engines", "Shut down just before touchdown if possible"), ">Evacuation."]),
        C("Evacuation", "Evacuation is needed.", [
            ("Aircraft / parking brake", "STOP / SET"), ("ATC", "Notify"), ("Cabin pressure", "Check zero (outflow open)"),
            (w["cut"].replace(" (affected)", " (all)"), w["cut_a"]), (w["fire"].replace(" (affected)", " (all)"), "PUSH / PULL"),
            ("APU fire", "PUSH / PULL"), ("Evacuation command", "Announce on PA: 'Evacuate, evacuate'"), ("Batteries", "OFF last")]),
        C("Crew incapacitation", "One pilot is incapacitated.", [
            ("Aircraft", "Fly it; engage the autopilot"), ("Cabin crew", "Call for help, secure the pilot"),
            ("Oxygen", "Give to the incapacitated pilot"), ("ATC", "Declare an emergency, divert"),
            "-Use a single-pilot flow. Use the cabin crew to read checklists."]),
        C("Severe turbulence", "Severe turbulence encountered.", [
            ("Seat belts", "ON, cabin crew seated"), ("Speed", "Turbulence penetration speed (Quick data)"),
            (w["at"], "OFF if thrust changes are large"), ("Altitude", "Allow altitude to vary; keep the attitude"),
            "-Request a level change or route to avoid the area."]),
    ]


def quick_data(f, v, w):
    """Returns rows of tables for the Quick data chapter."""
    fam = v["family"]
    pitch = ([("Takeoff (below thrust reduction)", "15°", "TOGA"), ("Climb below FL100", "10°", "CLB"), ("Climb above FL100", "5°", "CLB"),
              ("Cruise (level)", "2.5° to 3.5°", "N1 ~ 80-85%"), ("Descent", "-1° to 0°", "IDLE"), ("Approach (flaps full, gear down)", "2.5° to 3°", "N1 ~ 55-60%")]
             if (w["airbus"] or fam == "A220") else
             [("Takeoff / initial climb (flaps extended)", "10°", "80% N1"), ("Climb (flaps up)", "4° to 8°", "CLB thrust"),
              ("Cruise (level)", "2.5° to 3.5°", "N1 ~ 80-85%"), ("Descent", "-2° to 0°", "IDLE"),
              ("Approach (landing flaps, gear down)", "2.5° to 3°", "N1 ~ 55-60%")])
    return dict(
        pitch=pitch,
        flaps=f["flaps"],
        speeds=[("VMO / MMO", f"{f['vmo']} kt / M{f['mmo']:.2f}"), ("Gear extend / retract", f"{f['gear']['vlo_ext']} / {f['gear']['vlo_ret']} kt"),
                ("Gear extended (VLE)", f"{f['gear']['vle']} kt"), ("Turbulence penetration", f"about {f['vmo'] - 30} kt (VMO minus 20-30 kt)" if f.get("turboprop") else ("about 270-280 kt / M0.76-0.80" if f["widebody"] else "about 275 kt / M0.76")),
                ("Maximum operating altitude", f"{f['ceiling']:,} ft"), ("Max demonstrated crosswind", f"{f['crosswind']} kt")],
        weights=[("MTOW", f"{v['mtow']:,} kg"), ("MLW", f"{v['mlw']:,} kg"), ("MZFW", f"{v['mzfw']:,} kg"),
                 ("Fuel capacity", f"{v['fuel_l']:,} L (about {v['fuel_kg']:,} kg)")],
        landing=[("Dry runway, normal", "1.00"), ("Wet runway", "1.15 to 1.25"), ("Contaminated (compact snow)", "1.6"),
                 ("One reverser inoperative", "1.05"), ("Antiskid inoperative", "1.5 to 1.8"), ("Spoilers inoperative", "1.3 to 1.5"),
                 ("Single hydraulic system lost", "1.1 to 1.3"), ("Flaps / slats jammed", "1.3 to 1.9 (depends on setting)"),
                 ("Overweight landing", "add about 3% per 10% over MLW")],
        flap_add=[("Slats / leading edge jammed retracted", "+10 to +25 kt"), ("Flaps jammed up (0 to 1)", "+30 to +40 kt"),
                  ("Flaps jammed partial", "+10 to +20 kt"), ("Ice remaining on airframe", "+5 to +10 kt")],
    )


CHAPTERS = [
    ("Memory items and immediate actions", memory_items),
    ("Engines and APU", engines_apu),
    ("Fire and smoke", fire_smoke),
    ("Air, pressurisation and ice", air),
    ("Electrical", electrical),
    ("Hydraulics", hydraulics),
    ("Flight controls", flight_controls),
    ("Landing gear and brakes", gear_brakes),
    ("Fuel", fuel),
    ("Navigation and instruments", nav),
    ("Miscellaneous", misc),
]
