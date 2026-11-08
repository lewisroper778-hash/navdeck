import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { Plane, RefreshCw, ArrowRight, Settings2 } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import AirlineLogo from "@/components/AirlineLogo";
import { btnPrimary } from "@/components/flight/ui";

const fmtEte = (s) => {
  const n = parseInt(s, 10);
  return isNaN(n) ? "—" : `${Math.floor(n / 3600)}h${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}`;
};

function FlightCard({ f, onOpen, i }) {
  const total = f.waypoints.length;
  const passed = f.waypoints.filter((w) => w.passed).length;
  const pct = total ? (passed / total) * 100 : 0;
  return (
    <button
      data-testid={`flight-card-${f.id}`}
      onClick={onOpen}
      style={{ animationDelay: `${i * 60}ms` }}
      className="animate-rise group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-left hover:border-sky-500 dark:hover:border-sky-500 hover:-translate-y-0.5 transition-[transform,border-color] duration-200"
    >
      <div className="flex items-center justify-between">
        <AirlineLogo icao={f.airline_icao} size="md" />
        <div className="flex items-center gap-2">
          {f.signoff?.signed && <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-400">SIGNED</span>}
          <span className="font-mono text-xs font-bold text-slate-500">{f.callsign}</span>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{f.origin}</span>
        <div className="flex-1 flex items-center">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <Plane className="mx-1 h-4 w-4 text-sky-600 rotate-45" />
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <span className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{f.destination}</span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span className="truncate max-w-[45%]">{f.origin_name}</span>
        <span className="truncate max-w-[45%] text-right">{f.destination_name}</span>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 font-mono">
        {[["ACFT", f.aircraft], ["DIST", f.distance], ["ETE", fmtEte(f.ete)], ["FIX", total]].map(([l, v]) => (
          <div key={l}>
            <div className="text-[9px] tracking-widest text-slate-400">{l}</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{v || "—"}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-sky-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
      </div>
      <ArrowRight className="absolute right-4 bottom-8 h-4 w-4 text-sky-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform]" />
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-6 lg:px-10 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-sky-600 dark:text-sky-400">Flight Deck</div>
            <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">My flights</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-xl">
              {pilotId ? (
                <>Your latest SimBrief OFP is imported automatically · Pilot ID <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{pilotId}</span></>
              ) : (
                "Link your SimBrief Pilot ID to start importing OFPs automatically."
              )}
            </p>
          </div>
          {pilotId ? (
            <button data-testid="import-ofp-button" onClick={() => sync(false)} disabled={syncing} className={`${btnPrimary} px-5 py-3`}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing SimBrief…" : "Sync latest OFP"}
            </button>
          ) : (
            <button data-testid="link-simbrief-button" onClick={() => navigate("/settings")} className={`${btnPrimary} px-5 py-3`}>
              <Settings2 className="h-4 w-4" /> Link SimBrief
            </button>
          )}
        </div>

        {!loaded && flights.length === 0 ? (
          <div className="font-mono text-sm text-slate-500">LOADING…</div>
        ) : flights.length === 0 ? (
          <div data-testid="flights-empty-state" className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-16 text-center">
            <Plane className="mx-auto h-10 w-10 text-slate-300 -rotate-45" />
            <h2 className="mt-4 font-heading text-xl font-bold text-slate-800 dark:text-white">No flights yet</h2>
            <p className="mt-2 text-slate-500 max-w-md mx-auto">Generate a flight plan on SimBrief — it will appear here automatically.</p>
          </div>
        ) : (
          <div data-testid="flights-list" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {flights.map((f, i) => (
              <FlightCard key={f.id} f={f} i={i} onOpen={() => navigate(`/flights/${f.id}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
