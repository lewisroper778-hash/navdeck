import { Navigation, Check, Trash2, Undo2 } from "lucide-react";
import { Panel, inputCls, signedDev } from "./ui";
import { nowHHMM, isHHMM, isNum } from "@/lib/utils-app";
import { toast } from "sonner";

const devTone = (v, invert = false) => {
  if (v === null || v === undefined || v === 0) return "text-slate-500";
  const bad = invert ? v > 0 : v < 0;
  return bad ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
};

function SkippedRow({ r, i, onSkip }) {
  return (
    <tr data-testid={`waypoint-row-${r.ident}-${i}`} className="border-b border-slate-100 bg-slate-50/70 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40">
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <div className="font-bold line-through">{r.ident}</div>
        <div className="text-[10px]">removed · direct</div>
      </td>
      <td colSpan={11} className="px-3 py-2 text-xs">Skipped by ATC direct — not flown</td>
      <td className="px-2 py-1.5">
        <button data-testid={`waypoint-restore-${r.ident}-${i}`} onClick={() => onSkip(r.ident, false, i)} aria-label={`Restore ${r.ident}`} title="Undo"
          className="grid h-11 w-11 place-items-center rounded-xl text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-500/10">
          <Undo2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function Row({ r, i, u, onLog, onToggle, onSkip, isNext, canDelete }) {
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
          onClick={() => onToggle(r.ident, !r.passed, i)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors ${
            r.passed ? "bg-violet-500 border-violet-500 text-white" : "border-slate-300 dark:border-slate-600 hover:border-violet-500"
          }`}
          aria-label={`toggle ${r.ident}`}
        >
          {r.passed && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="font-bold text-slate-900 dark:text-white">{r.ident}</div>
        <div className={`text-[10px] truncate max-w-[120px] ${r.direct ? "font-bold text-sky-600 dark:text-sky-400" : "text-slate-400"}`}>
          {r.direct ? `DCT · −${r.saved_nm} nm` : r.airway || "DCT"}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.altitude ? Math.round(r.altitude / 100) : "—"}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-[11px] text-slate-600 dark:text-slate-300">{r.wind}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.gs || "—"}</td>
      <td className="hidden lg:table-cell px-3 py-2 text-right text-slate-600 dark:text-slate-300">{r.distance || "—"}</td>
      <td className="px-3 py-2 text-right text-slate-500">{r.planned || "—"}</td>
      <td data-testid={`eto-${r.ident}-${i}`} className={`px-3 py-2 text-right font-semibold ${r.ata ? "text-slate-400" : "text-fuchsia-600 dark:text-fuchsia-400"}`}>
        {r.eto || "—"}
      </td>
      <td className="px-2 py-1.5 w-[150px]">
        <div className="flex gap-1">
          <input
            key={`ata-${r.ata}`}
            data-testid={`ata-input-${r.ident}-${i}`}
            defaultValue={r.ata || ""}
            placeholder="HH:MM"
            maxLength={5}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (r.ata || "")) return;
              if (v && !isHHMM(v)) {
                e.target.value = r.ata || "";
                return toast.error("ATA must be HH:MM (UTC), e.g. 14:05");
              }
              onLog(r.ident, { ata: v }, i);
            }}
            className={`${inputCls} !px-1.5 !py-2.5 text-center text-xs`}
          />
          {!r.ata && (
            <button
              data-testid={`ata-now-${r.ident}-${i}`}
              onClick={() => onLog(r.ident, { ata: nowHHMM() }, i)}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 text-[11px] font-bold text-white active:scale-95 transition-transform"
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
            const raw = e.target.value.trim().replace(/,/g, "");
            if (raw && !isNum(raw)) {
              e.target.value = d(r.actual_fob) ?? "";
              return toast.error("FOB must be a number");
            }
            const v = raw === "" ? "" : String(u.toOfp(raw));
            v !== (r.actual_fob || "") && onLog(r.ident, { actual_fob: v }, i);
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
      <td className="px-2 py-1.5">
        {canDelete && (
          <button data-testid={`waypoint-delete-${r.ident}-${i}`} onClick={() => onSkip(r.ident, true, i)} aria-label={`Remove ${r.ident}`} title="Remove (ATC direct)"
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

export default function NavlogTable({ rows, u, onLog, onToggle, onSkip }) {
  const nextIdx = rows.findIndex((r) => !r.passed && !r.skipped);
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
          Log ATA + FOB · bin removes fixes for a direct
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
              <H><span className="sr-only">Remove</span></H>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-10 text-center text-slate-500">No waypoints in this OFP.</td>
              </tr>
            )}
            {rows.map((r, i) =>
              r.skipped ? (
                <SkippedRow key={`${r.ident}-${i}`} r={r} i={i} onSkip={onSkip} />
              ) : (
                <Row key={`${r.ident}-${i}`} r={r} i={i} u={u} onLog={onLog} onToggle={onToggle} onSkip={onSkip} isNext={i === nextIdx}
                  canDelete={!!onSkip && !r.passed && !r.ata && i < rows.length - 1} />
              )
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
