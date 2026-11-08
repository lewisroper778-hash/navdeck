import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { Plane, Download, ArrowRight, Plus } from "lucide-react";
import { makeClient } from "@/lib/api";
import { DASH } from "@/constants/testIds";
import Navbar from "@/components/Navbar";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [pilotId, setPilotId] = useState(null);

  const api = makeClient(getToken);

  const load = async () => {
    setLoading(true);
    try {
      const [profile, list] = await Promise.all([
        api.get("/me"),
        api.get("/flights"),
      ]);
      setPilotId(profile.data.simbrief_pilot_id);
      setFlights(list.data);
    } catch (e) {
      toast.error("Failed to load flights");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const handleImport = async () => {
    if (!pilotId) {
      toast.error("Set your SimBrief Pilot ID first", {
        action: { label: "Settings", onClick: () => navigate("/settings") },
      });
      return;
    }
    setImporting(true);
    try {
      const res = await api.post("/flights/import", {});
      toast.success(`Imported ${res.data.origin} → ${res.data.destination}`);
      navigate(`/flights/${res.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-[1400px] px-8 py-10">
        <div className="flex items-end justify-between border-b border-slate-200 pb-6 mb-8">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Flight Deck
            </div>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-slate-900 mt-2">
              My Flights
            </h1>
            <p className="text-slate-600 mt-2 max-w-xl">
              Imported operational flight plans from SimBrief. Click any flight to open the navlog.
            </p>
          </div>
          <button
            data-testid={DASH.importButton}
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 rounded-sm bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {importing ? "Fetching OFP…" : "Import latest OFP from SimBrief"}
          </button>
        </div>

        {loading ? (
          <div className="font-mono text-sm text-slate-500">LOADING OFP DATA…</div>
        ) : flights.length === 0 ? (
          <EmptyState onImport={handleImport} />
        ) : (
          <div data-testid={DASH.flightList} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {flights.map((f) => (
              <FlightCard key={f.id} flight={f} onOpen={() => navigate(`/flights/${f.id}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onImport }) {
  return (
    <div
      data-testid={DASH.emptyState}
      className="border border-dashed border-slate-300 bg-white p-16 text-center"
    >
      <Plane className="mx-auto h-10 w-10 text-slate-400 -rotate-45" />
      <h2 className="mt-4 font-heading text-xl font-bold text-slate-800">No flights imported yet</h2>
      <p className="mt-2 text-slate-600 max-w-md mx-auto">
        Set your SimBrief Pilot ID in Settings, then import your latest OFP.
      </p>
      <button
        onClick={onImport}
        className="mt-6 inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
      >
        <Plus className="h-4 w-4" />
        Import OFP
      </button>
    </div>
  );
}

function FlightCard({ flight, onOpen }) {
  const passed = flight.waypoints.filter((w) => w.passed).length;
  const total = flight.waypoints.length;
  const progress = total ? Math.round((passed / total) * 100) : 0;
  return (
    <button
      data-testid={DASH.flightCard(flight.id)}
      onClick={onOpen}
      className="group border border-slate-200 bg-white p-6 text-left transition-colors hover:border-sky-600"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {flight.callsign || "FLIGHT"}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-heading text-3xl font-bold text-slate-900">{flight.origin}</span>
            <ArrowRight className="h-5 w-5 text-sky-700" />
            <span className="font-heading text-3xl font-bold text-slate-900">{flight.destination}</span>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {flight.origin_name} → {flight.destination_name}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Aircraft</div>
          <div className="font-mono text-sm font-bold text-slate-800 mt-1">{flight.aircraft || "—"}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4 border-t border-slate-100 pt-4">
        <Meta label="DIST" value={flight.distance ? `${flight.distance} NM` : "—"} />
        <Meta label="ETE" value={flight.ete ? fmt(flight.ete) : "—"} />
        <Meta label="FL" value={flight.cruise_level ? `FL${String(flight.cruise_level).slice(0, 3)}` : "—"} />
        <Meta label="WPTS" value={`${total}`} />
      </div>

      {total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <span>Progress</span>
            <span>
              {passed}/{total}
            </span>
          </div>
          <div className="mt-2 h-1 bg-slate-100">
            <div
              className="h-full bg-sky-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-sm font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function fmt(seconds) {
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
