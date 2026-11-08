import { useState } from "react";
import { FileWarning, Search } from "lucide-react";
import { Panel, inputCls } from "../ui";

const GROUPS = [["origin", "Departure"], ["destination", "Arrival"], ["alternate", "Alternate"], ["enroute", "En route"]];
const CLOSURE = /\b(CLSD|CLOSED|U\/S|UNSERVICEABLE|OUT OF SERVICE|NOT AVBL|UNAVBL)\b/i;
const fmt = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}z` : "PERM");

function NotamItem({ n }) {
  const [raw, setRaw] = useState(false);
  const closure = CLOSURE.test(n.text);
  return (
    <li data-testid={`notam-${n.id}`} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
      <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
        <b className="text-slate-900 dark:text-white">{n.id}</b>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{n.location}</span>
        {n.category && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{n.category}</span>}
        {closure && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">Closure / outage</span>}
        <span className="ml-auto text-slate-500">{fmt(n.effective)} → {fmt(n.expires)}</span>
      </div>
      <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{raw && n.raw ? n.raw : n.text}</p>
      {n.raw && (
        <button data-testid={`notam-raw-${n.id}`} onClick={() => setRaw((v) => !v)} className="mt-2 min-h-[36px] text-xs font-semibold text-sky-600 dark:text-sky-400">
          {raw ? "Show decoded" : "Show raw"}
        </button>
      )}
    </li>
  );
}

export default function NotamsPanel({ notams = {} }) {
  const [tab, setTab] = useState("origin");
  const [q, setQ] = useState("");
  const list = (notams[tab] || []).filter((n) => !q || `${n.id} ${n.location} ${n.text}`.toUpperCase().includes(q.toUpperCase()));
  const total = GROUPS.reduce((s, [k]) => s + (notams[k]?.length || 0), 0);

  return (
    <Panel title="NOTAMs" icon={FileWarning} tone="amber" testId="notams-panel" right={<span data-testid="notams-total" className="font-mono text-xs text-slate-500">{total} total</span>}>
      {total === 0 ? (
        <p data-testid="notams-empty" className="text-sm text-slate-500">No NOTAMs in this flight plan. Re-import the OFP from SimBrief to load them.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {GROUPS.map(([k, label]) => (
              <button key={k} data-testid={`notams-tab-${k}`} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors ${tab === k ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                {label} <span className="ml-1 font-mono text-xs opacity-80">{notams[k]?.length || 0}</span>
              </button>
            ))}
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input data-testid="notams-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search e.g. RWY, ILS, TWY" className={`${inputCls} pl-9`} />
          </div>
          <ul data-testid="notams-list" className="max-h-[520px] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {list.length ? list.map((n, i) => <NotamItem key={`${n.id}-${i}`} n={n} />) : <li className="text-sm text-slate-500">Nothing matches.</li>}
          </ul>
        </>
      )}
    </Panel>
  );
}
