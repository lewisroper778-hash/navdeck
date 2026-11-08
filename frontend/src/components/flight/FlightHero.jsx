import { ArrowRight, Printer, RotateCcw, Trash2, Lock } from "lucide-react";
import { LogoPill } from "@/components/AirlineLogo";
import { UtcClock } from "./TimeTiles";

const fmtEte = (s) => {
  const n = parseInt(s, 10);
  return isNaN(n) ? "—" : `${Math.floor(n / 3600)}h ${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}m`;
};

export default function FlightHero({ f, onPrint, onReset, onDelete }) {
  const chips = [
    ["ALTN", f.alternate],
    ["FL", f.cruise_level ? Math.round(f.cruise_level / 100) : null],
    ["DIST", f.distance ? `${f.distance} nm` : null],
    ["ETE", fmtEte(f.ete)],
  ];
  return (
    <section data-testid="flight-summary" className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900 p-6 md:p-8 text-white shadow-xl shadow-indigo-950/20">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <LogoPill flight={f} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="flight-callsign" className="rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-bold tracking-widest">{f.callsign || "—"}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs">{f.aircraft}</span>
              {f.status === "closed" && (
                <span data-testid="closed-badge" className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-3 py-1 font-mono text-xs font-bold text-emerald-200">
                  <Lock className="h-3 w-3" /> CLOSED
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div>
                <div className="font-heading text-4xl md:text-5xl font-extrabold tracking-tight">{f.origin}</div>
                <div className="max-w-[170px] truncate text-xs text-white/60">{f.origin_name}</div>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><ArrowRight className="h-5 w-5 text-cyan-300" /></span>
              <div>
                <div className="font-heading text-4xl md:text-5xl font-extrabold tracking-tight">{f.destination}</div>
                <div className="max-w-[170px] truncate text-xs text-white/60">{f.destination_name}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5"><UtcClock className="text-slate-900" /></div>
          <div className="flex gap-2">
            <button data-testid="print-pdf-button" onClick={onPrint} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-4 text-sm font-semibold hover:bg-white/25 transition-colors"><Printer className="h-4 w-4" /> Navlog PDF</button>
            <button data-testid="reset-tracker-button" onClick={onReset} disabled={f.status === "closed"} title={f.status === "closed" ? "Reopen the flight to reset" : "Reset actuals"} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><RotateCcw className="h-4 w-4" /></button>
            <button data-testid="delete-flight-button" onClick={onDelete} title="Delete" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-rose-500/25 text-rose-100 hover:bg-rose-500/40 transition-colors"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-2">
        {chips.map(([l, v]) => (
          <span key={l} className="rounded-2xl bg-white/10 px-3.5 py-2 font-mono text-xs"><span className="text-white/50">{l}</span> <b>{v ?? "—"}</b></span>
        ))}
      </div>
    </section>
  );
}
