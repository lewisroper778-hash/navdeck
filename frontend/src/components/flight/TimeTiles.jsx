import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { TONES, inputCls } from "./ui";
import { nowHHMM } from "@/lib/utils-app";

export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const valid = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Big touch tile for logging a block event (gate out, takeoff, landing, gate in)
export function EventTile({ code, label, sched, value, onSet, tone = "sky", testId }) {
  const [editing, setEditing] = useState(false);
  const t = TONES[tone];
  const save = (v) => {
    setEditing(false);
    if (v === (value || "")) return;
    if (v && !valid(v)) return;
    onSet(v);
  };
  return (
    <div data-testid={testId} className={`relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 ${value ? "" : "ring-4 " + t.ring}`}>
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${t.grad}`} />
      <div className="flex items-start justify-between">
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${t.chip}`}>{code}</span>
          <div className="mt-2 font-heading text-lg font-bold text-slate-900 dark:text-white">{label}</div>
        </div>
        <div className="text-right font-mono text-[11px] text-slate-400">
          SCHED<div className="text-sm font-semibold text-slate-500 dark:text-slate-300">{sched || "--:--"}</div>
        </div>
      </div>
      {editing ? (
        <input
          autoFocus
          data-testid={`${testId}-input`}
          defaultValue={value || ""}
          placeholder="HH:MM"
          maxLength={5}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${inputCls} mt-4 !text-3xl !font-bold text-center !py-3`}
        />
      ) : (
        <button
          data-testid={`${testId}-value`}
          onClick={() => setEditing(true)}
          className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 py-3"
        >
          <span className={`font-mono text-4xl font-bold tabular-nums ${value ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-600"}`}>
            {value || "--:--"}
          </span>
          <Pencil className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
        </button>
      )}
      <button
        data-testid={`${testId}-now`}
        onClick={() => onSet(nowHHMM())}
        className={`mt-3 w-full rounded-2xl bg-gradient-to-r ${t.grad} min-h-[52px] font-heading text-base font-bold text-white shadow-md active:scale-[0.98] transition-transform`}
      >
        {value ? "Update to now" : `${label} now`}
      </button>
    </div>
  );
}

function secondsUntil(hhmm, now) {
  if (!valid(hhmm || "")) return null;
  const d = new Date(now);
  const [h, m] = hhmm.split(":").map(Number);
  let s = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - now) / 1000);
  if (s < -43200) s += 86400;
  if (s > 43200) s -= 86400;
  return s;
}

export function CountdownTile({ label, hint, value, onChange, testId }) {
  const now = useNow();
  const s = secondsUntil(value, now);
  const abs = Math.abs(s || 0);
  const txt = s === null ? "--:--:--" : `${s < 0 ? "+" : "−"}${[abs / 3600, (abs % 3600) / 60, abs % 60].map((x) => String(Math.floor(x)).padStart(2, "0")).join(":")}`;
  const tone = s === null ? "text-slate-300 dark:text-slate-600" : s < 0 ? "text-rose-500" : s < 300 ? "text-amber-500" : "text-emerald-500";
  return (
    <div data-testid={testId} className="rounded-3xl bg-slate-900 dark:bg-black/40 p-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-heading text-lg font-bold">{label}</div>
          <div className="text-xs text-slate-400">{hint}</div>
        </div>
        <input
          key={value || "empty"}
          data-testid={`${testId}-input`}
          defaultValue={value || ""}
          placeholder="HH:MM"
          maxLength={5}
          onBlur={(e) => e.target.value !== (value || "") && (e.target.value === "" || valid(e.target.value)) && onChange(e.target.value)}
          className="w-24 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-center font-mono text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-white/10"
        />
      </div>
      <div data-testid={`${testId}-countdown`} className={`mt-4 font-mono text-4xl font-bold tabular-nums ${tone}`}>{txt}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {s === null ? "Not set" : s < 0 ? "Elapsed" : "Remaining"}
      </div>
    </div>
  );
}

export function UtcClock() {
  const now = useNow();
  return (
    <span data-testid="utc-clock" className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
      {new Date(now).toISOString().slice(11, 19)}z
    </span>
  );
}
