import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ChevronLeft, Lock, Unlock } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import { computeNavlog, computeFuel, computeWeights, unitTools } from "@/lib/flightCalc";
import { PHASES, currentPhase } from "@/lib/phases";
import Navbar from "@/components/Navbar";
import { TONES, btnGhost } from "@/components/flight/ui";
import FlightHero from "@/components/flight/FlightHero";
import PhaseStepper from "@/components/flight/PhaseStepper";
import FlightReport from "@/components/flight/FlightReport";
import BriefingPhase, { NotamsSection } from "@/components/flight/phases/BriefingPhase";
import DeparturePhase from "@/components/flight/phases/DeparturePhase";
import EnroutePhase from "@/components/flight/phases/EnroutePhase";
import ArrivalPhase from "@/components/flight/phases/ArrivalPhase";
import ClosePhase from "@/components/flight/phases/ClosePhase";
import CopilotChat from "@/components/flight/CopilotChat";

const VIEWS = { briefing: BriefingPhase, departure: DeparturePhase, enroute: EnroutePhase, arrival: ArrivalPhase, close: ClosePhase };

function PhaseFooter({ index, go }) {
  const prev = PHASES[index - 1];
  const next = PHASES[index + 1];
  return (
    <div className="flex items-center justify-between gap-3 pt-2 pr-20">
      {prev ? (
        <button data-testid="phase-prev-button" onClick={() => go(prev.key)} className={`${btnGhost} !min-h-[56px] !px-6`}>
          <ArrowLeft className="h-4 w-4" /> {prev.label}
        </button>
      ) : <span />}
      {next && (
        <button
          data-testid="phase-next-button"
          onClick={() => go(next.key)}
          className={`inline-flex min-h-[56px] items-center gap-2 rounded-2xl bg-gradient-to-r ${TONES[next.tone].grad} px-7 font-heading text-base font-bold text-white shadow-md active:scale-[0.98] transition-transform`}
        >
          Next: {next.label} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function FlightProcessPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { id, phase } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(() => cache.getFlight(id));
  const [printMode, setPrintMode] = useState("navlog");
  const [profileName, setProfileName] = useState(() => cache.getProfile()?.display_name);
  const api = useMemo(() => makeClient(getToken), [getToken]);

  const apply = (f) => {
    setFlight(f);
    cache.setFlight(id, f);
  };

  useEffect(() => {
    api.get("/me").then((r) => { cache.setProfile(r.data); setProfileName(r.data.display_name); }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    api.get(`/flights/${id}`).then((r) => apply(r.data)).catch((e) => {
      if (e.response?.status === 404) {
        toast.error("Flight not found");
        navigate("/");
      } else if (cache.getFlight(id)) toast.info("Offline — showing cached flight");
    });
    // eslint-disable-next-line
  }, [id]);

  const call = (fn) =>
    fn()
      .then((r) => { apply(r.data); return true; })
      .catch((e) => {
        const d = e.response?.data?.detail;
        // FastAPI 422 returns an array of error objects; never pass an object to toast (crashes React)
        const msg = Array.isArray(d) ? d.map((x) => x.msg?.replace(/^Value error, /, "")).join("; ") : d;
        toast.error(msg || "Update failed — check connection");
        return false;
      });

  if (!flight)
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <Navbar />
        <div className="p-10 font-mono text-sm text-slate-500">LOADING FLIGHT…</div>
      </div>
    );

  if (!phase || !VIEWS[phase]) return <Navigate to={`/flights/${id}/${currentPhase(flight).key}`} replace />;

  const go = (key) => {
    navigate(`/flights/${id}/${key}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const exportPdf = (mode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 150);
  };
  const u = unitTools(flight);
  const rows = computeNavlog(flight);
  const ctx = {
    f: flight,
    rows,
    u,
    fuelCalc: computeFuel(flight, rows),
    wc: computeWeights(flight),
    pilotName: profileName || user?.fullName,
    goto: go,
    exportPdf,
    saveTimes: (b) => call(() => api.patch(`/flights/${id}/times`, b)),
    saveActuals: (b) => call(() => api.patch(`/flights/${id}/actuals`, b)),
    saveArrival: (b) => call(() => api.patch(`/flights/${id}/arrival`, b)),
    saveNotes: (b) => call(() => api.patch(`/flights/${id}/notes`, b)),
    logWp: (ident, b, index) => call(() => api.patch(`/flights/${id}/waypoint-log`, { ident, index, ...b })),
    toggleWp: (ident, passed, index) => call(() => api.post(`/flights/${id}/waypoint`, { ident, passed, index })),
    sign: (b) => call(() => api.post(`/flights/${id}/signoff`, b)).then((ok) => ok && toast.success("Report signed")),
    close: () => call(() => api.post(`/flights/${id}/close`, {})).then((ok) => ok && toast.success("Flight closed — nice work, Captain")),
    reopen: () => call(() => api.post(`/flights/${id}/reopen`, {})),
  };
  const index = PHASES.findIndex((p) => p.key === phase);
  const View = VIEWS[phase];
  const P = PHASES[index];
  // Close step keeps its own reopen/export controls; every other step is read-only once closed
  const locked = flight.status === "closed" && phase !== "close";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 print:!bg-white">
      <div className="print:hidden">
        <Navbar />
        <main className="mx-auto max-w-[1400px] space-y-5 px-4 md:px-6 lg:px-8 py-5 pb-32">
          <button data-testid="back-button" onClick={() => navigate("/")} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm hover:text-sky-600">
            <ChevronLeft className="h-4 w-4" /> All flights
          </button>
          <FlightHero
            f={flight}
            onPrint={() => exportPdf("navlog")}
            onReset={() => window.confirm("Clear all logged times, fuel, landing rate and signature?") && call(() => api.post(`/flights/${id}/reset`, {}))}
            onDelete={() =>
              window.confirm("Delete this flight?") &&
              api.delete(`/flights/${id}`).then(() => { toast.success("Flight deleted"); navigate("/"); }).catch(() => toast.error("Delete failed"))
            }
          />
          <div className="sticky top-16 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-2 bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur-md">
            <PhaseStepper flight={flight} active={phase} onSelect={go} />
          </div>
          <div key={phase} className="animate-rise space-y-5" data-testid={`phase-view-${phase}`}>
            <div className="flex items-end justify-between px-1">
              <div>
                <div className={`font-mono text-[11px] font-bold uppercase tracking-[0.2em] ${TONES[P.tone].text}`}>Step {index + 1} of {PHASES.length}</div>
                <h1 className="font-heading text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">{P.label}</h1>
                <p className="text-sm text-slate-500">{P.sub}</p>
              </div>
            </div>
            {locked && (
              <div data-testid="locked-banner" className="flex flex-col gap-3 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                  <Lock className="h-5 w-5" />
                  <span className="font-medium">This flight is closed and locked in your logbook. Reopen it to make changes.</span>
                </div>
                <button data-testid="locked-reopen-button" onClick={ctx.reopen} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300 shadow-sm">
                  <Unlock className="h-4 w-4" /> Reopen flight
                </button>
              </div>
            )}
            <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:[&_input]:opacity-60 disabled:[&_button]:opacity-50 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:shadow-none">
              <View ctx={ctx} />
            </fieldset>
            {phase === "briefing" && <NotamsSection f={flight} locked={locked} />}
            <PhaseFooter index={index} go={go} />
          </div>
        </main>
      </div>
      <CopilotChat flightId={id} />
      <FlightReport flight={flight} rows={rows} fuelCalc={ctx.fuelCalc} wc={ctx.wc} u={u} mode={printMode} />
    </div>
  );
}
