import { CheckCircle2, Circle, Lock, Unlock, ListChecks, FileDown } from "lucide-react";
import { Panel, btnGhost } from "../ui";
import SignOffPanel from "../SignOffPanel";
import { closeBlockers } from "@/lib/phases";
import AiCard from "../AiCard";

export default function ClosePhase({ ctx }) {
  const { f, goto, sign, exportPdf, close, reopen, pilotName } = ctx;
  const items = closeBlockers(f);
  const ready = items.every((i) => i.ok);
  const closed = f.status === "closed";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Completion checklist" icon={ListChecks} tone="rose" testId="close-checklist">
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.label}>
                <button
                  data-testid={`check-${i.label.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => !i.ok && goto(i.phase)}
                  className={`flex w-full min-h-[52px] items-center gap-3 rounded-2xl px-4 text-left transition-colors ${
                    i.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {i.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
                  <span className={`font-medium ${i.ok ? "text-emerald-800 dark:text-emerald-300" : "text-slate-700 dark:text-slate-200"}`}>{i.label}</span>
                  {!i.ok && <span className="ml-auto text-xs font-semibold text-rose-500">Complete →</span>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <SignOffPanel flight={f} pilotName={pilotName} onSign={sign} onExport={exportPdf} />
      </div>
      <AiCard title="AI flight debrief" mode="debrief" flightId={f.id} saved={f.ai?.debrief} tone="rose" cta="Debrief my flight" testId="ai-debrief" />

      <div
        data-testid="close-flight-section"
        className={`flex flex-col gap-4 rounded-[32px] p-6 md:flex-row md:items-center md:justify-between ${
          closed ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white" : "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div>
          <div className="font-heading text-2xl font-extrabold">{closed ? "Flight closed" : ready ? "Ready to close" : "Not ready to close yet"}</div>
          <div className={closed ? "text-white/85" : "text-slate-500"}>
            {closed
              ? `Closed ${f.closed_at?.replace("T", " ").slice(0, 16)}z · signed PDF saved to your Logbook`
              : ready
              ? "Everything is complete. Closing locks this flight in your logbook."
              : `${items.filter((i) => !i.ok).length} item(s) remaining on the checklist.`}
          </div>
        </div>
        <div className="flex gap-2">
          {f.signoff?.signed && (
            <button data-testid="close-export-report" onClick={() => exportPdf("report")} className={closed ? "inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white/20 px-5 font-semibold hover:bg-white/30" : btnGhost}>
              <FileDown className="h-4 w-4" /> Report PDF
            </button>
          )}
          {closed ? (
            <button data-testid="reopen-flight-button" onClick={reopen} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-5 font-semibold text-emerald-700">
              <Unlock className="h-4 w-4" /> Reopen
            </button>
          ) : (
            <button
              data-testid="close-flight-button"
              disabled={!ready}
              onClick={close}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 font-heading text-base font-bold text-white shadow-md shadow-rose-500/25 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:shadow-none"
            >
              <Lock className="h-4 w-4" /> Close flight
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
