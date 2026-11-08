export function Panel({ title, icon: Icon, right, children, className = "", testId }) {
  return (
    <section
      data-testid={testId}
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
            <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.16em] text-slate-800 dark:text-slate-200">
              {title}
            </h2>
          </div>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
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
  "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-colors";

export const btnGhost =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50";

export const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-900/10 hover:bg-sky-700 transition-colors disabled:opacity-50";

export const signedDev = (v, suffix = "") =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString()}${suffix}`;
