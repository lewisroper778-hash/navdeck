import { useState } from "react";
import { PlaneTakeoff, ExternalLink } from "lucide-react";
import { Panel, inputCls, btnPrimary, btnGhost } from "@/components/flight/ui";

// Opens SimBrief's dispatch page pre-filled; once generated, "Import" pulls the new OFP into NAVDECK
export default function SimbriefPlanner({ onImport, importing }) {
  const [p, setP] = useState({ orig: "", dest: "", type: "", airline: "", fltnum: "", deph: "", depm: "" });
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value.toUpperCase() });
  const ready = /^[A-Z]{4}$/.test(p.orig) && /^[A-Z]{4}$/.test(p.dest) && p.type.length >= 3;
  const url = () => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)));
    return `https://dispatch.simbrief.com/options/custom?${q.toString()}`;
  };
  const F = ({ k, label, ph, max }) => (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input data-testid={`planner-${k}`} value={p[k]} onChange={set(k)} placeholder={ph} maxLength={max} className={`${inputCls} mt-1 uppercase`} />
    </label>
  );
  return (
    <Panel title="Create a flight plan" icon={PlaneTakeoff} tone="sky" testId="simbrief-planner">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {F({ k: "orig", label: "Departure", ph: "EGLL", max: 4 })}
        {F({ k: "dest", label: "Arrival", ph: "LFPG", max: 4 })}
        {F({ k: "type", label: "Aircraft", ph: "A320", max: 4 })}
        {F({ k: "airline", label: "Airline", ph: "BAW", max: 3 })}
        {F({ k: "fltnum", label: "Flight no.", ph: "304", max: 5 })}
        {F({ k: "deph", label: "Dep hour Z", ph: "14", max: 2 })}
        {F({ k: "depm", label: "Dep min", ph: "30", max: 2 })}
      </div>
      <div className="mt-4 flex flex-col gap-2 md:flex-row">
        <a data-testid="planner-generate" href={ready ? url() : undefined} target="_blank" rel="noreferrer" aria-disabled={!ready} className={`${btnPrimary} flex-1 ${ready ? "" : "pointer-events-none opacity-40"}`}>
          <ExternalLink className="h-4 w-4" /> Generate on SimBrief
        </a>
        <button data-testid="planner-import" onClick={onImport} disabled={importing} className={`${btnGhost} flex-1`}>{importing ? "Importing…" : "Import generated OFP"}</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">SimBrief opens with your details filled in. Press Generate there, then come back and tap Import.</p>
    </Panel>
  );
}
