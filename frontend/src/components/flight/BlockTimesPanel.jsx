import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Panel, inputCls } from "./ui";
import { diffMin, nowHHMM } from "@/lib/utils-app";

const EVENTS = [
  { key: "off", label: "OFF", sched: "sched_off", hint: "Block off" },
  { key: "takeoff", label: "T-O", sched: "sched_takeoff", hint: "Takeoff" },
  { key: "landing", label: "LDG", sched: "sched_landing", hint: "Landing" },
  { key: "on", label: "ON", sched: "sched_on", hint: "Block on" },
];

const dur = (a, b) => {
  const d = diffMin(b, a);
  if (d === null) return "—";
  const m = (d + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function countdown(hhmm, now) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const d = new Date(now);
  const [h, m] = hhmm.split(":").map(Number);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
  let s = Math.round((target - now) / 1000);
  if (s < -43200) s += 86400;
  if (s > 43200) s -= 86400;
  return s;
}

function Countdown({ label, value, onChange, now, testId }) {
  const s = countdown(value, now);
  const neg = s !== null && s < 0;
  const abs = s === null ? 0 : Math.abs(s);
  const txt = s === null ? "--:--:--" : `${neg ? "+" : "-"}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const tone = s === null ? "text-slate-400" : neg ? "text-red-600 dark:text-red-400" : s < 300 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
        <input
          data-testid={`${testId}-input`}
          defaultValue={value || ""}
          placeholder="HH:MM"
          maxLength={5}
          onBlur={(e) => e.target.value !== (value || "") && onChange(e.target.value)}
          className={`${inputCls} !w-20 !py-1 text-center`}
        />
      </div>
      <div data-testid={`${testId}-countdown`} className={`mt-2 font-mono text-2xl font-bold tabular-nums ${tone}`}>
        {txt}
      </div>
    </div>
  );
}

export default function BlockTimesPanel({ flight, onSave }) {
  const t = flight.times || {};
  const now = useNow();
  const utc = new Date(now).toISOString().slice(11, 19);

  return (
    <Panel
      title="Block Times"
      icon={Clock}
      testId="block-times-panel"
      right={<span data-testid="utc-clock" className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">{utc}z</span>}
    >
      <div className="grid grid-cols-4 gap-2">
        {EVENTS.map((e) => (
          <div key={e.key} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-400">{e.label}</span>
              <span className="font-mono text-[10px] text-slate-400">{t[e.sched] || "--:--"}</span>
            </div>
            <input
              key={t[e.key] || "empty"}
              data-testid={`time-${e.key}-input`}
              defaultValue={t[e.key] || ""}
              placeholder="HH:MM"
              maxLength={5}
              onBlur={(ev) => ev.target.value !== (t[e.key] || "") && onSave({ [e.key]: ev.target.value })}
              className={`${inputCls} mt-1.5 text-center`}
            />
            <button
              data-testid={`time-${e.key}-now`}
              onClick={() => onSave({ [e.key]: nowHHMM() })}
              className="mt-1.5 w-full rounded-md bg-slate-900 dark:bg-sky-600 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-700 dark:hover:bg-sky-500 transition-colors"
            >
              Now
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
        <div className="rounded-md bg-slate-50 dark:bg-slate-950 px-3 py-2 flex justify-between">
          <span className="text-slate-500">BLOCK</span>
          <span data-testid="block-duration" className="font-bold text-slate-900 dark:text-white">{dur(t.off, t.on)}</span>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-slate-950 px-3 py-2 flex justify-between">
          <span className="text-slate-500">AIRBORNE</span>
          <span data-testid="flight-duration" className="font-bold text-slate-900 dark:text-white">{dur(t.takeoff, t.landing)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Countdown label="TSAT" value={t.tsat} now={now} onChange={(v) => onSave({ tsat: v })} testId="tsat" />
        <Countdown label="CTOT" value={t.ctot} now={now} onChange={(v) => onSave({ ctot: v })} testId="ctot" />
      </div>
    </Panel>
  );
}
