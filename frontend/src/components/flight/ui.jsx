export const TONES = {
  sky: { grad: "from-sky-500 to-cyan-400", chip: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400", solid: "bg-sky-500 hover:bg-sky-600", ring: "ring-sky-500/30", soft: "bg-sky-50 dark:bg-sky-500/10" },
  amber: { grad: "from-amber-500 to-orange-400", chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", solid: "bg-amber-500 hover:bg-amber-600", ring: "ring-amber-500/30", soft: "bg-amber-50 dark:bg-amber-500/10" },
  violet: { grad: "from-violet-500 to-fuchsia-400", chip: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", text: "text-violet-600 dark:text-violet-400", solid: "bg-violet-500 hover:bg-violet-600", ring: "ring-violet-500/30", soft: "bg-violet-50 dark:bg-violet-500/10" },
  emerald: { grad: "from-emerald-500 to-teal-400", chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", solid: "bg-emerald-500 hover:bg-emerald-600", ring: "ring-emerald-500/30", soft: "bg-emerald-50 dark:bg-emerald-500/10" },
  rose: { grad: "from-rose-500 to-pink-400", chip: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300", text: "text-rose-600 dark:text-rose-400", solid: "bg-rose-500 hover:bg-rose-600", ring: "ring-rose-500/30", soft: "bg-rose-50 dark:bg-rose-500/10" },
};

export function Panel({ title, icon: Icon, right, children, className = "", testId, tone = "sky" }) {
  return (
    <section
      data-testid={testId}
      className={`rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/50 dark:shadow-none ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${TONES[tone].chip}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
            )}
            <h2 className="font-heading text-base font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          </div>
          {right}
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = "default", testId }) {
  const tones = {
    default: "text-slate-900 dark:text-white",
    accent: "text-sky-700 dark:text-sky-400",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
  };
  return (
    <div data-testid={testId}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-mono text-lg font-bold mt-0.5 ${tones[tone]}`}>{value ?? "—"}</div>
      {sub && <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-mono text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-500/15 transition-colors";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 min-h-[44px] text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-50";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 min-h-[44px] text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:brightness-105 active:scale-[0.98] transition-[filter,transform] disabled:opacity-40 disabled:shadow-none";

export const signedDev = (v, suffix = "") =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString()}${suffix}`;
