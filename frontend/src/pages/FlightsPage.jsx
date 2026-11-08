import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { Plane, RefreshCw, ArrowRight, Settings2 } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import AirlineLogo from "@/components/AirlineLogo";
import { TONES } from "@/components/flight/ui";
import { PHASES, currentPhase } from "@/lib/phases";

const fmtEte = (s) => {
  const n = parseInt(s, 10);
  return isNaN(n) ? "—" : `${Math.floor(n / 3600)}h${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}`;
};

function FlightCard({ f, onOpen, i }) {
  const closed = f.status === "closed";
  const phase = currentPhase(f);
  const t = TONES[closed ? "emerald" : phase.tone];
  const doneCount = PHASES.filter((p) => p.done(f)).length;
  return (
    <button
      data-testid={`flight-card-${f.id}`}
      onClick={onOpen}
      style={{ animationDelay: `${i * 60}ms` }}
      className="animate-rise group relative overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-left shadow-sm hover:shadow-lg hover:-translate-y-1 transition-[transform,box-shadow] duration-200"
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${t.grad}`} />
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-2xl bg-white px-2.5 py-1.5 ring-1 ring-slate-200/80"><AirlineLogo flight={f} size="md" /></span>
        <div className="flex flex-col items-end gap-1">
          <span data-testid={`flight-status-${f.id}`} className={`rounded-full px-3 py-1 text-xs font-bold ${t.chip}`}>
            {closed ? "Closed" : phase.label}
          </span>
          <span className="font-mono text-xs font-bold text-slate-500">{f.callsign}</span>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{f.origin}</span>
        <div className="flex-1 flex items-center">
          <div className="h-0.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
          <span className={`mx-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${t.grad} text-white`}><Plane className="h-4 w-4 rotate-45" /></span>
          <div className="h-0.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <span className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{f.destination}</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span className="truncate max-w-[45%]">{f.origin_name}</span>
        <span className="truncate max-w-[45%] text-right">{f.destination_name}</span>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 font-mono">
        {[["ACFT", f.aircraft], ["DIST", f.distance], ["ETE", fmtEte(f.ete)], ["LDG", f.landing_rate ? `-${Math.abs(f.landing_rate)}` : null]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
            <div className="text-[9px] tracking-widest text-slate-400">{l}</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{v || "—"}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-1.5">
        {PHASES.map((p) => (
          <div key={p.key} className={`h-2 flex-1 rounded-full ${p.done(f) ? `bg-gradient-to-r ${TONES[p.tone].grad}` : "bg-slate-100 dark:bg-slate-800"}`} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{doneCount}/{PHASES.length} steps complete</span>
        <ArrowRight className={`h-4 w-4 ${t.text} -translate-x-1 group-hover:translate-x-0 transition-transform`} />
      </div>
    </button>
  );
}

export default function FlightsPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const [flights, setFlights] = useState(() => cache.getFlights());
  const [pilotId, setPilotId] = useState(() => cache.getProfile()?.simbrief_pilot_id);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const autoRan = useRef(false);

  const refreshList = async () => {
    const r = await api.get("/flights");
    setFlights(r.data);
    cache.setFlights(r.data);
  };

  const sync = async (silent) => {
    setSyncing(true);
    try {
      const before = flights.length;
      const r = await api.post("/flights/import", {});
      await refreshList();
      if (!silent) toast.success(`OFP ${r.data.origin} → ${r.data.destination} synced`);
      else if (before === 0 || !flights.some((f) => f.id === r.data.id)) toast.success(`New OFP imported: ${r.data.origin} → ${r.data.destination}`);
    } catch (e) {
      if (!silent) toast.error(e.response?.data?.detail || "SimBrief sync failed");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [p] = await Promise.all([api.get("/me"), refreshList()]);
        cache.setProfile(p.data);
        setPilotId(p.data.simbrief_pilot_id);
        if (p.data.simbrief_pilot_id && !autoRan.current) {
          autoRan.current = true;
          sync(true);
        }
      } catch {
        if (cache.getFlights().length) toast.info("Offline — showing cached flights");
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1400px] px-4 md:px-6 lg:px-8 py-8">
        <div className="relative mb-8 flex flex-col justify-between gap-6 overflow-hidden rounded-[32px] bg-gradient-to-br from-sky-500 via-indigo-500 to-fuchsia-500 p-7 md:p-9 text-white shadow-xl shadow-indigo-500/20 md:flex-row md:items-end">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
          <div className="relative">
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/80">Flight Deck</div>
            <h1 className="font-heading text-4xl sm:text-5xl font-extrabold tracking-tight mt-2">My flights</h1>
            <p className="text-white/85 mt-2 max-w-xl">
              {pilotId ? (
                <>Your latest SimBrief OFP is imported automatically · Pilot ID <span className="font-mono font-semibold text-white">{pilotId}</span></>
              ) : (
                "Link your SimBrief Pilot ID to start importing OFPs automatically."
              )}
            </p>
          </div>
          {pilotId ? (
            <button data-testid="import-ofp-button" onClick={() => sync(false)} disabled={syncing} className="relative inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-6 font-semibold text-indigo-700 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing SimBrief…" : "Sync latest OFP"}
            </button>
          ) : (
            <button data-testid="link-simbrief-button" onClick={() => navigate("/settings")} className="relative inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-6 font-semibold text-indigo-700 shadow-lg">
              <Settings2 className="h-4 w-4" /> Link SimBrief
            </button>
          )}
        </div>

        {!loaded && flights.length === 0 ? (
          <div className="font-mono text-sm text-slate-500">LOADING…</div>
        ) : flights.length === 0 ? (
          <div data-testid="flights-empty-state" className="rounded-[28px] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-16 text-center">
            <Plane className="mx-auto h-10 w-10 text-slate-300 -rotate-45" />
            <h2 className="mt-4 font-heading text-xl font-bold text-slate-800 dark:text-white">No flights yet</h2>
            <p className="mt-2 text-slate-500 max-w-md mx-auto">Generate a flight plan on SimBrief — it will appear here automatically.</p>
          </div>
        ) : (
          <div data-testid="flights-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {flights.map((f, i) => (
              <FlightCard key={f.id} f={f} i={i} onOpen={() => navigate(`/flights/${f.id}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
