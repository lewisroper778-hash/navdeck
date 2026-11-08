import { useEffect, useState } from "react";
import SignaturePad from "./SignaturePad";
import { PenLine, FileDown, BadgeCheck } from "lucide-react";
import { Panel, inputCls, btnPrimary, btnGhost } from "./ui";

export default function SignOffPanel({ flight, pilotName, onSign, onExport }) {
  const s = flight.signoff || {};
  const [name, setName] = useState(s.signed_by || pilotName || "");
  const [remarks, setRemarks] = useState(s.remarks || "");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [signature, setSignature] = useState(null);

  useEffect(() => {
    if (!touched && !s.signed_by && pilotName) setName(pilotName);
  }, [pilotName, touched, s.signed_by]);

  return (
    <Panel title="End-of-flight report" icon={PenLine} tone="rose" testId="signoff-panel">
      {s.signed ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
            <BadgeCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <div data-testid="signed-status" className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Report signed</div>
              <div className="font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                {new Date(s.signed_at).toISOString().replace("T", " ").slice(0, 16)}z
              </div>
            </div>
          </div>
          {s.signature ? (
            <img data-testid="signed-signature" src={s.signature} alt="Commander signature" className="h-24 rounded-2xl bg-white p-2 ring-1 ring-slate-200" />
          ) : (
            <div className="font-signature text-3xl text-slate-800 dark:text-slate-100 border-b border-slate-300 dark:border-slate-700 pb-1">{s.signed_by}</div>
          )}
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.signed_by}</div>
          {s.remarks && <p className="text-sm text-slate-600 dark:text-slate-400">{s.remarks}</p>}
          <button data-testid="export-report-button" onClick={() => onExport("report")} className={`${btnPrimary} w-full justify-center`}>
            <FileDown className="h-4 w-4" /> Export signed report PDF
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Commander</span>
            <input data-testid="signoff-name-input" value={name} onChange={(e) => { setTouched(true); setName(e.target.value); }} className={`${inputCls} mt-1 font-sans`} />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Remarks</span>
            <textarea
              data-testid="signoff-remarks-input"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Tech log, ATC notes…"
              className={`${inputCls} mt-1 font-sans resize-none`}
            />
          </label>
          <SignaturePad onChange={setSignature} />
          <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input data-testid="signoff-agree-checkbox" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-sky-600" />
            I certify this flight was conducted as recorded in this navlog.
          </label>
          <div className="flex gap-2">
            <button
              data-testid="signoff-submit-button"
              disabled={!name.trim() || !agree || !signature}
              onClick={() => onSign({ signed_by: name.trim(), remarks: remarks.trim() || null, signature })}
              className={`${btnPrimary} flex-1 justify-center`}
            >
              <PenLine className="h-4 w-4" /> Sign report
            </button>
            <button data-testid="export-navlog-button" onClick={() => onExport("navlog")} className={btnGhost}>
              <FileDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
