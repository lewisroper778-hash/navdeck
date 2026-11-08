import { Check } from "lucide-react";
import { PHASES } from "@/lib/phases";
import { TONES } from "./ui";

export default function PhaseStepper({ flight, active, onSelect }) {
  return (
    <nav data-testid="phase-stepper" className="flex gap-2 overflow-x-auto rounded-[28px] border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-2 backdrop-blur-md shadow-sm">
      {PHASES.map((p, i) => {
        const done = p.done(flight);
        const isActive = p.key === active;
        const t = TONES[p.tone];
        const Icon = p.icon;
        return (
          <button
            key={p.key}
            data-testid={`phase-tab-${p.key}`}
            onClick={() => onSelect(p.key)}
            className={`flex min-w-[150px] flex-1 items-center gap-3 rounded-[22px] px-3 py-2.5 text-left transition-colors ${
              isActive ? `bg-gradient-to-r ${t.grad} text-white shadow-md` : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                isActive ? "bg-white/25 text-white" : done ? "bg-emerald-500 text-white" : t.chip
              }`}
            >
              {done && !isActive ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className={`block font-mono text-[10px] font-bold uppercase tracking-widest ${isActive ? "text-white/80" : "text-slate-400"}`}>
                Step {i + 1}
              </span>
              <span className={`block truncate font-heading text-sm font-bold ${isActive ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>{p.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
