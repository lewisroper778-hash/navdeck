import { Scale, CheckCircle2, XCircle } from "lucide-react";
import { Panel, inputCls } from "./ui";

function LimitRow({ label, check, d, testId }) {
  const pct = check.value && check.max ? Math.min(100, (check.value / check.max) * 100) : 0;
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="font-bold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className={check.over ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-900 dark:text-white font-bold"}>
            {d(check.value)?.toLocaleString() ?? "—"}
          </span>
          <span className="text-slate-400">/ {d(check.max)?.toLocaleString() ?? "—"}</span>
          {check.max &&
            (check.over ? (
              <XCircle data-testid={`${testId}-over`} className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ))}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${check.over ? "bg-red-500" : pct > 95 ? "bg-amber-500" : "bg-sky-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function WeightsPanel({ flight, wc, u, onSave }) {
  const w = flight.weights || {};
  const d = u.toDisp;
  return (
    <Panel
      title="Loadsheet"
      tone="amber"
      icon={Scale}
      testId="weights-panel"
      right={
        <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
          {["KG", "LB"].map((x) => (
            <button
              key={x}
              data-testid={`units-${x.toLowerCase()}`}
              onClick={() => x !== u.units && onSave({ units: x })}
              className={`rounded-full px-4 py-1.5 font-mono text-xs font-bold transition-colors ${
                u.units === x ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" : "text-slate-500"
              }`}
            >
              {x}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Actual pax</span>
          <input
            key={`pax-${w.pax_count}`}
            data-testid="actual-pax-input"
            defaultValue={w.pax_count || ""}
            inputMode="numeric"
            onBlur={(e) => e.target.value !== (w.pax_count || "") && onSave({ pax_count: e.target.value })}
            className={`${inputCls} mt-1`}
          />
          <span className="font-mono text-[10px] text-slate-400">plan {w.planned_pax ?? "—"}</span>
        </label>
        <label>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Cargo {u.units}</span>
          <input
            key={`cargo-${w.cargo}-${u.units}`}
            data-testid="actual-cargo-input"
            defaultValue={d(w.cargo) ?? ""}
            inputMode="numeric"
            onBlur={(e) => {
              const v = e.target.value === "" ? "" : String(u.toOfp(e.target.value));
              v !== (w.cargo || "") && onSave({ cargo: v });
            }}
            className={`${inputCls} mt-1`}
          />
          <span className="font-mono text-[10px] text-slate-400">plan {d(w.planned_cargo)?.toLocaleString() ?? "—"}</span>
        </label>
      </div>
      <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex justify-between font-mono text-sm">
        <span className="text-slate-500">PAYLOAD</span>
        <span data-testid="payload-value" className="font-bold text-slate-900 dark:text-white">{d(wc.payload)?.toLocaleString() ?? "—"} {u.units}</span>
      </div>
      <div className="mt-4 space-y-3">
        <LimitRow label="ZFW" check={wc.zfw} d={d} testId="zfw-check" />
        <LimitRow label="TOW" check={wc.tow} d={d} testId="tow-check" />
        <LimitRow label="LAW" check={wc.law} d={d} testId="law-check" />
      </div>
    </Panel>
  );
}
