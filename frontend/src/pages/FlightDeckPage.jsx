import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Trash2, Printer, ArrowRight } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import { computeNavlog, computeFuel, computeWeights, unitTools } from "@/lib/flightCalc";
import Navbar from "@/components/Navbar";
import AirlineLogo from "@/components/AirlineLogo";
import { btnGhost, Stat } from "@/components/flight/ui";
import BlockTimesPanel from "@/components/flight/BlockTimesPanel";
import FuelPanel from "@/components/flight/FuelPanel";
import WeightsPanel from "@/components/flight/WeightsPanel";
import NavlogTable from "@/components/flight/NavlogTable";
import SignOffPanel from "@/components/flight/SignOffPanel";
import FlightReport from "@/components/flight/FlightReport";

const fmtEte = (s) => {
  const n = parseInt(s, 10);
  return isNaN(n) ? "—" : `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}`;
};

function Header({ f, onReset, onDelete, onPrint }) {
  return (
    <section data-testid="flight-summary" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="relative p-6 lg:p-8 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 text-white">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {f.airline_icao && <div className="rounded-lg bg-white px-3 py-2"><AirlineLogo icao={f.airline_icao} size="lg" /></div>}
            <div>
              <div data-testid="flight-callsign" className="font-mono text-xs tracking-[0.25em] text-sky-300">{f.callsign || "—"} · {f.aircraft}</div>
              <div className="mt-1 flex items-center gap-4">
                <div>
                  <div className="font-heading text-4xl lg:text-5xl font-bold tracking-tight">{f.origin}</div>
                  <div className="text-xs text-slate-400 max-w-[160px] truncate">{f.origin_name}</div>
                </div>
                <ArrowRight className="h-6 w-6 text-fuchsia-400" />
                <div>
                  <div className="font-heading text-4xl lg:text-5xl font-bold tracking-tight">{f.destination}</div>
                  <div className="text-xs text-slate-400 max-w-[160px] truncate">{f.destination_name}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button data-testid="print-pdf-button" onClick={onPrint} className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 px-3 py-2 text-sm font-medium backdrop-blur transition-colors"><Printer className="h-4 w-4" /> Navlog PDF</button>
            <button data-testid="reset-tracker-button" onClick={onReset} className="inline-flex items-center rounded-md bg-white/10 hover:bg-white/20 px-3 py-2 transition-colors" title="Reset actuals"><RotateCcw className="h-4 w-4" /></button>
            <button data-testid="delete-flight-button" onClick={onDelete} className="inline-flex items-center rounded-md bg-red-500/20 hover:bg-red-500/40 text-red-200 px-3 py-2 transition-colors" title="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800">
        {[
          ["Alternate", f.alternate],
          ["Cruise", f.cruise_level ? `FL${Math.round(f.cruise_level / 100)}` : null],
          ["Distance", f.distance ? `${f.distance} nm` : null],
          ["ETE", fmtEte(f.ete)],
          ["Pax", f.weights?.pax_count],
          ["OFP", f.raw_simbrief_id],
        ].map(([l, v]) => (
          <div key={l} className="px-5 py-3"><Stat label={l} value={v} /></div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
        <span className="font-bold text-sky-700 dark:text-sky-400 mr-2">RTE</span>{f.route || "—"}
      </div>
    </section>
  );
}

export default function FlightDeckPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { id } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(() => cache.getFlight(id));
  const [printMode, setPrintMode] = useState("navlog");
  const api = useMemo(() => makeClient(getToken), [getToken]);

  const apply = (f) => {
    setFlight(f);
    cache.setFlight(id, f);
  };

  useEffect(() => {
    api.get(`/flights/${id}`).then((r) => apply(r.data)).catch((e) => {
      if (e.response?.status === 404) {
        toast.error("Flight not found");
        navigate("/");
      } else if (cache.getFlight(id)) toast.info("Offline — showing cached navlog");
    });
    // eslint-disable-next-line
  }, [id]);

  const call = (fn) =>
    fn()
      .then((r) => { apply(r.data); return true; })
      .catch(() => { toast.error("Update failed — check connection"); return false; });

  const exportPdf = (mode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 150);
  };

  if (!flight)
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Navbar />
        <div className="p-10 font-mono text-sm text-slate-500">LOADING NAVLOG…</div>
      </div>
    );

  const u = unitTools(flight);
  const rows = computeNavlog(flight);
  const fuelCalc = computeFuel(flight, rows);
  const wc = computeWeights(flight);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 print:!bg-white">
      <div className="print:hidden">
        <Navbar />
        <main className="mx-auto max-w-[1600px] px-6 lg:px-10 py-6 space-y-5">
          <button data-testid="back-button" onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-600 transition-colors">
            <ArrowLeft className="h-4 w-4" /> All flights
          </button>
          <Header
            f={flight}
            onPrint={() => exportPdf("navlog")}
            onReset={() => window.confirm("Clear all logged times, fuel and signature?") && call(() => api.post(`/flights/${id}/reset`, {}))}
            onDelete={() =>
              window.confirm("Delete this flight?") &&
              api.delete(`/flights/${id}`).then(() => { toast.success("Flight deleted"); navigate("/"); }).catch(() => toast.error("Delete failed"))
            }
          />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8 space-y-5">
              <FuelPanel flight={flight} rows={rows} fuelCalc={fuelCalc} u={u} />
            </div>
            <div className="xl:col-span-4 space-y-5">
              <BlockTimesPanel flight={flight} onSave={(b) => call(() => api.patch(`/flights/${id}/times`, b))} />
            </div>
          </div>
          <NavlogTable
            rows={rows}
            u={u}
            onLog={(ident, b) => call(() => api.patch(`/flights/${id}/waypoint-log`, { ident, ...b }))}
            onToggle={(ident, passed) => call(() => api.post(`/flights/${id}/waypoint`, { ident, passed }))}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <WeightsPanel flight={flight} wc={wc} u={u} onSave={(b) => call(() => api.patch(`/flights/${id}/actuals`, b))} />
            <SignOffPanel
              flight={flight}
              pilotName={user?.fullName}
              onExport={exportPdf}
              onSign={(b) => call(() => api.post(`/flights/${id}/signoff`, b)).then((ok) => ok && toast.success("Report signed"))}
            />
          </div>
        </main>
      </div>
      <FlightReport flight={flight} rows={rows} fuelCalc={fuelCalc} wc={wc} u={u} mode={printMode} />
    </div>
  );
}
