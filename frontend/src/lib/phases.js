import { ClipboardList, PlaneTakeoff, Navigation, PlaneLanding, ClipboardCheck } from "lucide-react";

export const PHASES = [
  { key: "briefing", label: "Briefing", sub: "Loadsheet & slots", icon: ClipboardList, tone: "sky", done: (f) => !!f.times?.off },
  { key: "departure", label: "Pushback", sub: "Gate out to takeoff", icon: PlaneTakeoff, tone: "amber", done: (f) => !!f.times?.takeoff },
  { key: "enroute", label: "Enroute", sub: "Navlog & fuel", icon: Navigation, tone: "violet", done: (f) => !!f.times?.landing },
  { key: "arrival", label: "Arrival", sub: "Landing to gate in", icon: PlaneLanding, tone: "emerald", done: (f) => !!(f.times?.on && f.landing_rate) },
  { key: "close", label: "Close", sub: "Sign & close", icon: ClipboardCheck, tone: "rose", done: (f) => f.status === "closed" },
];

export const currentPhase = (f) => PHASES.find((p) => !p.done(f)) || PHASES[PHASES.length - 1];

export function closeBlockers(f) {
  const t = f.times || {};
  const items = [
    { label: "Left gate time", ok: !!t.off, phase: "departure" },
    { label: "Takeoff time", ok: !!t.takeoff, phase: "departure" },
    { label: "Landing time", ok: !!t.landing, phase: "arrival" },
    { label: "Arrived at gate time", ok: !!t.on, phase: "arrival" },
    { label: "Landing rate", ok: !!f.landing_rate, phase: "arrival" },
    { label: "Signed report", ok: !!f.signoff?.signed, phase: "close" },
  ];
  return items;
}

export function landingRating(fpm) {
  const v = Math.abs(parseFloat(fpm));
  if (isNaN(v)) return null;
  if (v <= 60) return { label: "Butter", tone: "emerald" };
  if (v <= 180) return { label: "Smooth", tone: "sky" };
  if (v <= 300) return { label: "Firm", tone: "amber" };
  if (v <= 600) return { label: "Hard", tone: "rose" };
  return { label: "Inspection required", tone: "rose" };
}
