import { useState } from "react";
import { Search } from "lucide-react";

export default function TrafficSearch({ pilots, onPick }) {
  const [q, setQ] = useState("");
  const term = q.trim().toUpperCase();
  const matches = term
    ? pilots.filter((p) => p.callsign.includes(term)).sort((a, b) => a.callsign.indexOf(term) - b.callsign.indexOf(term) || a.callsign.localeCompare(b.callsign)).slice(0, 8)
    : [];
  const pick = (p) => { onPick(p); setQ(""); };

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        data-testid="traffic-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && matches[0] && pick(matches[0])}
        placeholder="Find callsign e.g. BAW123"
        className="h-11 w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 font-mono text-sm uppercase text-slate-900 outline-none transition-colors focus:border-sky-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
      />
      {term && (
        <div data-testid="traffic-search-results" className="absolute left-0 right-0 top-full z-[1000] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {matches.length === 0 ? (
            <div data-testid="traffic-search-empty" className="px-4 py-3 font-mono text-xs text-slate-500">No aircraft online with that callsign</div>
          ) : matches.map((p) => (
            <button key={p.cid} data-testid={`traffic-search-result-${p.callsign}`} onClick={() => pick(p)}
              className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left font-mono text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
              <b className="text-slate-900 dark:text-white">{p.callsign}</b>
              <span className="text-xs text-slate-500">{p.dep || "?"}→{p.arr || "?"} · {p.aircraft || "?"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
