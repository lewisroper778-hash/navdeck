import { Gauge, Fuel } from "lucide-react";
import { EventTile } from "../TimeTiles";
import { Panel, TONES, inputCls } from "../ui";
import { landingRating } from "@/lib/phases";
import { diffMin } from "@/lib/utils-app";

const dur = (a, b) => {
  if (!a || !b) return "—";
  const m = (diffMin(b, a) + 1440) % 1440;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

const PRESETS = [60, 120, 180, 250, 350];

export default function ArrivalPhase({ ctx }) {
  const { f, u, saveTimes, saveArrival } = ctx;
  const t = f.times || {};
  const rating = landingRating(f.landing_rate);
  const used = f.arrival_fob && f.fuel?.block ? Number(f.fuel.block) - Number(f.arrival_fob) : null;
  const planUsed = f.fuel?.block && f.waypoints.length ? Number(f.fuel.block) - Number(f.waypoints[f.waypoints.length - 1].fob || 0) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <EventTile code="LDG" label="Landing" sched={t.sched_landing} value={t.landing} tone="emerald" onSet={(v) => saveTimes({ landing: v })} testId="event-landing" />
        <EventTile code="ON" label="Arrived at gate" sched={t.sched_on} value={t.on} tone="violet" onSet={(v) => saveTimes({ on: v })} testId="event-on" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Landing rate" icon={Gauge} tone="emerald" testId="landing-rate-panel">
          <div className="flex items-end gap-3">
            <input
              key={f.landing_rate || "empty"}
              data-testid="landing-rate-input"
              defaultValue={f.landing_rate || ""}
              inputMode="numeric"
              placeholder="e.g. 140"
              onBlur={(e) => {
                const v = e.target.value.replace(/[^\d-]/g, "");
                v !== (f.landing_rate || "") && saveArrival({ landing_rate: v });
              }}
              className={`${inputCls} !text-4xl !font-bold !py-4 text-center`}
            />
            <span className="pb-4 font-mono text-lg font-semibold text-slate-400">fpm</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} data-testid={`landing-preset-${p}`} onClick={() => saveArrival({ landing_rate: String(p) })} className="min-h-[40px] rounded-full bg-slate-100 dark:bg-slate-800 px-4 font-mono text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
                -{p}
              </button>
            ))}
          </div>
          {rating && (
            <div data-testid="landing-rating" className={`mt-4 rounded-2xl bg-gradient-to-r ${TONES[rating.tone].grad} px-5 py-4 text-white`}>
              <div className="text-xs font-semibold text-white/80">Touchdown</div>
              <div className="font-heading text-2xl font-extrabold">{rating.label} · -{Math.abs(f.landing_rate)} fpm</div>
            </div>
          )}
        </Panel>

        <Panel title="Arrival summary" icon={Fuel} tone="violet" testId="arrival-summary">
          <label className="block">
            <span className="text-xs text-slate-500">Fuel on board at gate ({u.units})</span>
            <input
              key={`${f.arrival_fob}-${u.units}`}
              data-testid="arrival-fob-input"
              defaultValue={u.toDisp(f.arrival_fob) ?? ""}
              inputMode="numeric"
              placeholder="FOB"
              onBlur={(e) => {
                const v = e.target.value === "" ? "" : String(u.toOfp(e.target.value));
                v !== (f.arrival_fob || "") && saveArrival({ arrival_fob: v });
              }}
              className={`${inputCls} mt-1 !text-xl !py-3`}
            />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Block time", dur(t.off, t.on), "block-time"],
              ["Air time", dur(t.takeoff, t.landing), "air-time"],
              ["Fuel used", used === null ? "—" : u.toDisp(used).toLocaleString(), "fuel-used"],
              ["Planned burn", planUsed === null ? "—" : u.toDisp(planUsed).toLocaleString(), "planned-burn"],
            ].map(([l, v, id]) => (
              <div key={l} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                <div className="text-xs text-slate-500">{l}</div>
                <div data-testid={id} className="font-mono text-xl font-bold text-slate-900 dark:text-white">{v}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
