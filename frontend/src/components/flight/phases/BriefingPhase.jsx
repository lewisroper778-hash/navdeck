import { Route as RouteIcon, Timer } from "lucide-react";
import { Panel } from "../ui";
import { CountdownTile } from "../TimeTiles";
import FuelPanel from "../FuelPanel";
import WeightsPanel from "../WeightsPanel";
import AiCard from "../AiCard";
import NotamsPanel from "./NotamsPanel";

export default function BriefingPhase({ ctx }) {
  const { f, rows, fuelCalc, wc, u, saveTimes, saveActuals } = ctx;
  const t = f.times || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Panel title="Route" icon={RouteIcon} tone="sky" className="lg:col-span-3" testId="route-panel">
          <p className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{f.route || "—"}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Gate out", t.sched_off], ["Takeoff", t.sched_takeoff], ["Landing", t.sched_landing], ["Gate in", t.sched_on]].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-slate-100 dark:border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-500">{l} (sched)</div>
                <div className="font-mono text-xl font-bold text-slate-900 dark:text-white">{v || "--:--"}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Slot times" icon={Timer} tone="amber" className="lg:col-span-2" testId="slot-panel">
          <div className="space-y-3">
            <CountdownTile label="TSAT" hint="Target start-up approval" value={t.tsat} onChange={(v) => saveTimes({ tsat: v })} testId="tsat" />
            <CountdownTile label="CTOT" hint="Calculated take-off time" value={t.ctot} onChange={(v) => saveTimes({ ctot: v })} testId="ctot" />
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FuelPanel flight={f} rows={rows} fuelCalc={fuelCalc} u={u} mode="plan" />
        <WeightsPanel flight={f} wc={wc} u={u} onSave={saveActuals} />
      </div>
      <AiCard title="AI briefing assistant" mode="briefing" flightId={f.id} saved={f.ai?.briefing} cta="Write my briefing" testId="ai-briefing" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3"><NotamsPanel notams={f.notams} /></div>
        <div className="lg:col-span-2">
          <AiCard title="NOTAM key points" mode="notams" flightId={f.id} saved={f.ai?.notams} cta="Summarise NOTAMs" tone="amber" testId="ai-notams"
            disabled={!Object.values(f.notams || {}).some((l) => l?.length)} />
        </div>
      </div>
    </div>
  );
}
