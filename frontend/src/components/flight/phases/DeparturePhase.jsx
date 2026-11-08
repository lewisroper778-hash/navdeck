import { DoorOpen, PlaneTakeoff } from "lucide-react";
import { EventTile, CountdownTile } from "../TimeTiles";
import { diffMin } from "@/lib/utils-app";

export default function DeparturePhase({ ctx }) {
  const { f, saveTimes, u } = ctx;
  const t = f.times || {};
  const taxi = t.off && t.takeoff ? (diffMin(t.takeoff, t.off) + 1440) % 1440 : null;
  const late = t.off && t.sched_off ? diffMin(t.off, t.sched_off) : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <EventTile code="OFF" label="Left gate" sched={t.sched_off} value={t.off} tone="amber" onSet={(v) => saveTimes({ off: v })} testId="event-off" />
        <EventTile code="T-O" label="Takeoff" sched={t.sched_takeoff} value={t.takeoff} tone="sky" onSet={(v) => saveTimes({ takeoff: v })} testId="event-takeoff" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <CountdownTile label="TSAT" hint="Start-up approval" value={t.tsat} onChange={(v) => saveTimes({ tsat: v })} testId="dep-tsat" />
        <CountdownTile label="CTOT" hint="Take-off slot" value={t.ctot} onChange={(v) => saveTimes({ ctot: v })} testId="dep-ctot" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Info icon={DoorOpen} label="Gate departure vs schedule" value={late === null ? "—" : `${late > 0 ? "+" : ""}${late} min`} tone={late > 5 ? "text-rose-500" : "text-emerald-500"} testId="gate-delay" />
        <Info icon={PlaneTakeoff} label="Taxi-out time" value={taxi === null ? "—" : `${taxi} min`} testId="taxi-time" />
        <Info icon={PlaneTakeoff} label={`Planned taxi fuel (${u.units})`} value={u.toDisp(f.fuel?.taxi)?.toLocaleString() ?? "—"} />
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value, tone = "text-slate-900 dark:text-white", testId }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"><Icon className="h-5 w-5" /></span>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div data-testid={testId} className={`font-mono text-2xl font-bold ${tone}`}>{value}</div>
      </div>
    </div>
  );
}
