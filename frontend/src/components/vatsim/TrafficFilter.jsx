import { Filter, X } from "lucide-react";

export const parseAirports = (text) => [...new Set(text.toUpperCase().split(/[\s,]+/).filter((x) => /^[A-Z0-9]{3,4}$/.test(x)))];

export default function TrafficFilter({ value, onChange, shown }) {
  const active = parseAirports(value).length > 0;
  return (
    <div className="relative w-full sm:w-64">
      <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        data-testid="traffic-filter-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Only airports e.g. EGLL KJFK"
        className={`h-11 w-full rounded-full border bg-white pl-10 pr-24 font-mono text-sm uppercase text-slate-900 outline-none transition-colors focus:border-sky-400 dark:bg-slate-900 dark:text-white ${active ? "border-sky-400" : "border-slate-200 dark:border-slate-800"}`}
      />
      {active && (
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span data-testid="traffic-filter-count" className="rounded-full bg-sky-500 px-2.5 py-1 font-mono text-[11px] font-bold text-white">{shown}</span>
          <button data-testid="traffic-filter-clear" onClick={() => onChange("")} aria-label="Clear filter" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
