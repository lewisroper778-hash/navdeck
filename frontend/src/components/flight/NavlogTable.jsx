import { Navigation, Check } from "lucide-react";
import { Panel, inputCls, signedDev } from "./ui";
import { nowHHMM } from "@/lib/utils-app";

const devTone = (v, invert = false) => {
  if (v === null || v === undefined || v === 0) return "text-slate-500";
  const bad = invert ? v > 0 : v < 0;
  return bad ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
};

function Row({ r, i, u, onLog, onToggle, isNext }) {
  const d = u.toDisp;
  return (
    <tr
      data-testid={`waypoint-row-${r.ident}-${i}`}
      className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
        r.passed
          ? "bg-violet-50/60 dark:bg-violet-950/20"
          : isNext
          ? "bg-fuchsia-50 dark:bg-fuchsia-950/30"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
      }`}
    >
      <td className="px-3 py-2">
        <button
          data-testid={`waypoint-toggle-${r.ident}-${i}`}
          onClick={() => onToggle(r.ident, !r.passed)}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-colors ${
            r.passed ? "bg-violet-500 border-violet-500 text-white" : "border-slate-300 dark:border-slate-600 hover:border-violet-500"
          }`}
          aria-label={`toggle ${r.ident}`}
        >
          {r.passed && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="font-bold text-slate-900 dark:text-white">{r.ident}</div>
        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{r.airway || "DCT"}</div>
      </td>
      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.altitude ? Math.round(r.altitude / 100) : "—"}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-[11px] text-slate-600 dark:text-slate-300">{r.wind}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.gs || "—"}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.distance || "—"}</td>
      <td className="px-3 py-2 text-right text-slate-500">{r.planned || "—"}</td>
      <td data-testid={`eto-${r.ident}-${i}`} className={`px-3 py-2 text-right font-semibold ${r.ata ? "text-slate-400" : "text-fuchsia-600 dark:text-fuchsia-400"}`}>
        {r.eto || "—"}
      </td>
      <td className="px-2 py-1.5 w-[132px]">
        <div className="flex gap-1">
          <input
            key={`ata-${r.ata}`}
            data-testid={`ata-input-${r.ident}-${i}`}
            defaultValue={r.ata || ""}
            placeholder="HH:MM"
            maxLength={5}
            onBlur={(e) => e.target.value !== (r.ata || "") && onLog(r.ident, { ata: e.target.value })}
            className={`${inputCls} !px-1.5 !py-2 text-center text-xs`}
          />
          {!r.ata && (
            <button
              data-testid={`ata-now-${r.ident}-${i}`}
              onClick={() => onLog(r.ident, { ata: nowHHMM() })}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 text-[10px] font-bold text-white active:scale-95 transition-transform"
              title="Log current UTC"
            >
              NOW
            </button>
          )}
        </div>
      </td>
      <td data-testid={`time-dev-${r.ident}-${i}`} className={`px-3 py-2 text-right ${devTone(r.timeDev, true)}`}>
        {r.timeDev === null ? "—" : signedDev(r.timeDev, "m")}
      </td>
      <td className="px-3 py-2 text-right text-slate-500">{d(r.fob)?.toLocaleString() ?? "—"}</td>
      <td className="px-2 py-1.5 w-[100px]">
        <input
          key={`fob-${r.actual_fob}-${u.units}`}
          data-testid={`fob-input-${r.ident}-${i}`}
          defaultValue={d(r.actual_fob) ?? ""}
          placeholder={d(r.estFob)?.toString() || ""}
          inputMode="numeric"
          onBlur={(e) => {
            const v = e.target.value === "" ? "" : String(u.toOfp(e.target.value));
            v !== (r.actual_fob || "") && onLog(r.ident, { actual_fob: v });
          }}
          className={`${inputCls} !px-1.5 !py-2 text-right text-xs`}
        />
      </td>
      <td data-testid={`fuel-dev-${r.ident}-${i}`} className={`px-3 py-2 text-right ${devTone(r.fuelDev)}`}>
        {r.fuelDev === null ? "—" : signedDev(d(r.fuelDev))}
        {r.actual_fob && r.min_fob && Number(r.actual_fob) < Number(r.min_fob) && (
          <div data-testid={`below-min-${r.ident}-${i}`} className="text-[9px] font-bold text-red-600">&lt; MIN</div>
        )}
      </td>
    </tr>
  );
}

export default function NavlogTable({ rows, u, onLog, onToggle }) {
  const nextIdx = rows.findIndex((r) => !r.passed);
  const H = ({ children, left, wide }) => (
    <th className={`px-3 py-3 border-b border-slate-200 dark:border-slate-800 ${left ? "text-left" : "text-right"} ${wide ? "hidden lg:table-cell" : ""}`}>{children}</th>
  );
  return (
    <Panel
      title="Navigation log"
      icon={Navigation}
      tone="violet"
      testId="navlog-table-panel"
      right={
        <span className="hidden md:inline rounded-full bg-violet-50 dark:bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-600 dark:text-violet-300">
          Log ATA + FOB · ETOs update instantly
        </span>
      }
      className="overflow-hidden"
    >
      <div className="-mx-6 -mb-6 overflow-x-auto">
        <table data-testid="navlog-table" className="w-full text-sm border-collapse font-mono">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
            <tr className="text-[10px] uppercase tracking-widest">
              <H left>✓</H>
              <H left>Fix</H>
              <H>FL</H>
              <H wide>Wind</H>
              <H wide>GS</H>
              <H wide>Dist</H>
              <H>Plan</H>
              <H>ETO</H>
              <H left>ATA</H>
              <H>ΔT</H>
              <H>Plan FOB</H>
              <H left>Act FOB {u.units}</H>
              <H>ΔF</H>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-10 text-center text-slate-500">No waypoints in this OFP.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <Row key={`${r.ident}-${i}`} r={r} i={i} u={u} onLog={onLog} onToggle={onToggle} isNext={i === nextIdx} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
