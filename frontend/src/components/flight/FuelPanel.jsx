import { Fuel, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { Panel, Stat, signedDev } from "./ui";
import { useTheme } from "@/lib/utils-app";

const STATE_STYLE = {
  NORMAL: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
  "MINIMUM FUEL": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
  "MAYDAY FUEL": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900 animate-pulse",
};

export default function FuelPanel({ flight, rows, fuelCalc, u, mode = "check" }) {
  const { theme } = useTheme();
  const f = flight.fuel || {};
  const d = u.toDisp;
  const data = rows.map((r) => ({
    name: r.ident,
    plan: d(r.fob),
    actual: r.actual_fob ? d(r.actual_fob) : null,
  }));
  const grid = theme === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = theme === "dark" ? "#64748b" : "#94a3b8";

  return (
    <Panel
      title={mode === "plan" ? "Fuel plan" : "Fuel check"}
      icon={Fuel}
      tone={mode === "plan" ? "emerald" : "violet"}
      testId={mode === "plan" ? "fuel-plan-card" : "fuel-check-card"}
      right={
        <span data-testid="fuel-state" className={`flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[10px] font-bold tracking-widest ${STATE_STYLE[fuelCalc.state]}`}>
          {fuelCalc.state !== "NORMAL" && <AlertTriangle className="h-3 w-3" />}
          {fuelCalc.state}
        </span>
      }
    >
      {mode === "plan" ? (
        <>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {[["Taxi", f.taxi], ["Trip", f.trip], ["Contingency", f.contingency], ["Alternate", f.alternate], ["Final reserve", f.reserve], ["Extra", f.extra]].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3"><Stat label={l} value={d(v)?.toLocaleString()} /></div>
            ))}
            <div className="col-span-3 md:col-span-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/80">Block fuel {u.units}</div>
              <div data-testid="block-fuel" className="font-mono text-2xl font-bold">{d(f.block)?.toLocaleString() ?? "—"}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3"><Stat testId="min-takeoff-fuel" label="Min take-off fuel" value={d(f.min_takeoff)?.toLocaleString()} tone="accent" /></div>
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3"><Stat testId="min-fuel" label="Min fuel" value={d(fuelCalc.minFuel)?.toLocaleString()} tone="warn" /></div>
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 px-4 py-3"><Stat testId="mayday-fuel" label="Mayday fuel" value={d(fuelCalc.mayday)?.toLocaleString()} tone="bad" /></div>
            <div className="rounded-2xl bg-sky-50 dark:bg-sky-500/10 px-4 py-3"><Stat label="Burn / hour" value={d(fuelCalc.burnHr)?.toLocaleString()} tone="accent" /></div>
          </div>
        </>
      ) : (
        <>
      <div className="h-56 rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-3" data-testid="fuel-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: axis, fontFamily: "IBM Plex Mono" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: axis, fontFamily: "IBM Plex Mono" }} />
            <Tooltip contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 11, borderRadius: 8 }} />
            <ReferenceLine y={d(fuelCalc.minFuel)} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "MIN", fontSize: 9, fill: "#f59e0b", position: "right" }} />
            <ReferenceLine y={d(fuelCalc.mayday)} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "MAYDAY", fontSize: 9, fill: "#ef4444", position: "right" }} />
            <Line type="monotone" dataKey="plan" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Planned FOB" />
            <Line type="monotone" dataKey="actual" stroke="#d946ef" strokeWidth={2} connectNulls dot={{ r: 3 }} name="Actual FOB" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          <Stat testId="fuel-deviation" label="Deviation" value={signedDev(d(fuelCalc.dev))} tone={fuelCalc.dev < 0 ? "bad" : fuelCalc.dev > 0 ? "good" : "default"} />,
          <Stat testId="landing-fuel" label="Est. landing" value={d(fuelCalc.landing)?.toLocaleString()} />,
          <Stat testId="min-fuel" label="Min fuel" value={d(fuelCalc.minFuel)?.toLocaleString()} tone="warn" sub="altn + final res" />,
          <Stat testId="mayday-fuel" label="Mayday fuel" value={d(fuelCalc.mayday)?.toLocaleString()} tone="bad" sub="final reserve" />,
          <Stat
            testId="holding-time"
            label="Hold before divert"
            value={fuelCalc.holdMin === null ? "—" : `${fuelCalc.holdMin} min`}
            tone={fuelCalc.holdMin !== null && fuelCalc.holdMin < 10 ? "bad" : "accent"}
            sub={fuelCalc.burnHr ? `@ ${d(fuelCalc.burnHr)?.toLocaleString()}/h` : null}
          />,
        ].map((s, i) => (
          <div key={i} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3">{s}</div>
        ))}
      </div>
        </>
      )}
    </Panel>
  );
}
