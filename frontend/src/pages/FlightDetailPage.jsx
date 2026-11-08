import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { ArrowLeft, Printer, RotateCcw, Trash2, Fuel, Check } from "lucide-react";
import { makeClient } from "@/lib/api";
import { DETAIL } from "@/constants/testIds";
import Navbar from "@/components/Navbar";

export default function FlightDetailPage() {
  const { getToken } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(null);
  const [loading, setLoading] = useState(true);

  const api = makeClient(getToken);

  const load = async () => {
    try {
      const r = await api.get(`/flights/${id}`);
      setFlight(r.data);
    } catch {
      toast.error("Flight not found");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  const toggle = async (ident, passed) => {
    try {
      const r = await api.post(`/flights/${id}/waypoint`, { ident, passed });
      setFlight(r.data);
    } catch {
      toast.error("Could not update waypoint");
    }
  };

  const reset = async () => {
    try {
      const r = await api.post(`/flights/${id}/reset`, {});
      setFlight(r.data);
      toast.success("Tracker reset");
    } catch {
      toast.error("Reset failed");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this flight?")) return;
    try {
      await api.delete(`/flights/${id}`);
      toast.success("Flight deleted");
      navigate("/");
    } catch {
      toast.error("Delete failed");
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="p-8 font-mono text-sm text-slate-500">LOADING NAVLOG…</div>
      </div>
    );

  if (!flight) return null;
  const passed = flight.waypoints.filter((w) => w.passed).length;
  const total = flight.waypoints.length;

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="print:hidden">
        <Navbar />
      </div>
      <main className="mx-auto max-w-[1400px] px-8 py-8 print:px-4 print:py-2">
        <button
          onClick={() => navigate("/")}
          className="print:hidden mb-6 flex items-center gap-1.5 text-sm text-slate-600 hover:text-sky-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to flights
        </button>

        {/* Summary Header */}
        <section
          data-testid={DETAIL.summary}
          className="border border-slate-200 bg-white"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-6 border-b border-slate-200">
            <div className="flex items-center gap-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Callsign</div>
                <div className="font-heading text-2xl font-bold tracking-tight text-slate-900 mt-1">
                  {flight.callsign || "—"}
                </div>
              </div>
              <div className="h-12 w-px bg-slate-200" />
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-4xl font-bold tracking-tight text-slate-900">
                  {flight.origin}
                </span>
                <span className="font-mono text-sky-700 text-xl">→</span>
                <span className="font-heading text-4xl font-bold tracking-tight text-slate-900">
                  {flight.destination}
                </span>
                {flight.alternate && (
                  <span className="ml-3 rounded-sm border border-slate-300 px-2 py-0.5 font-mono text-xs text-slate-600">
                    ALTN · {flight.alternate}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                data-testid={DETAIL.printButton}
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                <Printer className="h-4 w-4" />
                Export PDF
              </button>
              <button
                data-testid={DETAIL.resetButton}
                onClick={reset}
                className="flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
              <button
                data-testid={DETAIL.deleteButton}
                onClick={remove}
                className="flex items-center gap-1.5 rounded-sm border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 border-b border-slate-200">
            <Metric label="Aircraft" value={flight.aircraft || "—"} />
            <Metric label="Cruise" value={flight.cruise_level ? `FL${String(flight.cruise_level).slice(0, 3)}` : "—"} />
            <Metric label="Distance" value={flight.distance ? `${flight.distance} NM` : "—"} />
            <Metric label="ETE" value={fmtTime(flight.ete)} />
            <Metric label="OUT" value={fmtTS(flight.sched_out)} />
            <Metric label="IN" value={fmtTS(flight.sched_in)} />
          </div>
          <div className="p-6">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Flight plan route
            </div>
            <div className="font-mono text-sm text-slate-800 leading-relaxed break-all">
              {flight.route || "—"}
            </div>
          </div>
        </section>

        {/* Fuel + Tracker summary */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section
            data-testid={DETAIL.fuelCard}
            className="lg:col-span-2 border border-slate-200 bg-white p-6"
          >
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-sky-700" />
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-900">
                Fuel Plan
              </h2>
            </div>
            <div className="mt-5 grid grid-cols-3 md:grid-cols-7 gap-4 border-t border-slate-100 pt-5">
              <Fuelbit label="Taxi" value={flight.fuel.taxi} />
              <Fuelbit label="Trip" value={flight.fuel.trip} />
              <Fuelbit label="Cont." value={flight.fuel.contingency} />
              <Fuelbit label="Altn." value={flight.fuel.alternate} />
              <Fuelbit label="Reserve" value={flight.fuel.reserve} />
              <Fuelbit label="Extra" value={flight.fuel.extra} />
              <Fuelbit label="Block" value={flight.fuel.block} highlight />
            </div>
          </section>
          <section className="border border-slate-200 bg-white p-6">
            <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-900">
              Tracker
            </h2>
            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Waypoints passed
                </div>
                <div className="font-mono text-3xl font-bold text-slate-900 mt-1">
                  {passed}
                  <span className="text-slate-400">/{total}</span>
                </div>
              </div>
              <div className="font-mono text-xs text-sky-700">
                {total ? Math.round((passed / total) * 100) : 0}%
              </div>
            </div>
            <div className="mt-3 h-2 bg-slate-100">
              <div
                className="h-full bg-sky-600 transition-all"
                style={{ width: `${total ? (passed / total) * 100 : 0}%` }}
              />
            </div>
          </section>
        </div>

        {/* Navlog Table */}
        <section className="mt-6 border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-900">
              Navigation Log
            </h2>
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Tick waypoints as you pass them in the sim
            </div>
          </div>
          <div className="overflow-x-auto">
            <table
              data-testid={DETAIL.navlogTable}
              className="w-full text-sm border-collapse"
            >
              <thead className="bg-slate-50 text-slate-600">
                <tr className="font-mono text-[10px] uppercase tracking-widest">
                  <th className="px-3 py-2.5 text-left border-b border-slate-200">✓</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-200">Waypoint</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-200">Airway</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">ALT</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">Wind</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">TAS</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">GS</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">Dist</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">ETE</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">ETA</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">Burn</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">FOB</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {flight.waypoints.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                      No waypoints in this OFP.
                    </td>
                  </tr>
                )}
                {flight.waypoints.map((w, i) => (
                  <tr
                    key={`${w.ident}-${i}`}
                    data-testid={DETAIL.waypointRow(w.ident)}
                    className={`border-b border-slate-100 ${
                      w.passed ? "bg-sky-50/70 text-slate-500 line-through decoration-sky-500/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <button
                        data-testid={DETAIL.waypointToggle(w.ident)}
                        onClick={() => toggle(w.ident, !w.passed)}
                        className={`flex h-5 w-5 items-center justify-center rounded-sm border transition-colors ${
                          w.passed
                            ? "bg-sky-600 border-sky-600 text-white"
                            : "border-slate-300 hover:border-sky-500"
                        }`}
                        aria-label={`toggle ${w.ident}`}
                      >
                        {w.passed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-sans">
                      <span className="font-mono font-bold text-slate-900">{w.ident}</span>
                      {w.name && <span className="ml-2 text-[11px] text-slate-500">{w.name}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{w.airway || "DCT"}</td>
                    <td className="px-3 py-2 text-right">{w.altitude || "—"}</td>
                    <td className="px-3 py-2 text-right text-[12px]">{w.wind || "—"}</td>
                    <td className="px-3 py-2 text-right">{w.tas || "—"}</td>
                    <td className="px-3 py-2 text-right">{w.gs || "—"}</td>
                    <td className="px-3 py-2 text-right">{w.distance || "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtMinSec(w.ete)}</td>
                    <td className="px-3 py-2 text-right">{fmtMinSec(w.eta)}</td>
                    <td className="px-3 py-2 text-right">{w.fuel_burn || "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{w.fob || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border-r border-slate-200 last:border-r-0 px-6 py-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-base font-bold text-slate-900 mt-1">{value || "—"}</div>
    </div>
  );
}

function Fuelbit({ label, value, highlight }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div
        className={`font-mono mt-1 ${
          highlight ? "text-xl font-bold text-sky-700" : "text-base font-bold text-slate-900"
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function fmtTime(seconds) {
  if (!seconds) return "—";
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function fmtMinSec(seconds) {
  if (!seconds) return "—";
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTS(ts) {
  if (!ts) return "—";
  const n = parseInt(ts, 10);
  if (isNaN(n)) return ts;
  const d = new Date(n * 1000);
  return d.toISOString().slice(11, 16) + "z";
}
