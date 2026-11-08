import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Cable } from "lucide-react";

const LABELS = { off: "Gate out", takeoff: "Takeoff", landing: "Landing", on: "Gate in" };

// Shows the sim helper status and reloads the flight whenever the helper fills something in
export default function SimLinkChip({ api, flight, onUpdate }) {
  const [s, setS] = useState(null);
  const version = useRef(null);

  useEffect(() => {
    const load = () => api.get("/bridge/status").then(({ data }) => {
      setS(data);
      if (version.current !== null && data.version !== version.current && data.flight_id === flight.id) {
        api.get(`/flights/${flight.id}`).then((r) => onUpdate(r.data)).catch(() => {});
        const e = data.last_event;
        if (e?.applied?.length) toast.success(`Sim: ${LABELS[e.type]} ${e.time}z filled in`, { description: e.applied.includes("landing_rate") ? "Touchdown rate recorded" : undefined });
      }
      version.current = data.version ?? 0;
    }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [api, flight.id]);

  if (!s?.paired || flight.status === "closed") return null;
  const here = s.flight_id === flight.id;
  const target = () => api.put("/bridge/target", { flight_id: flight.id }).then(() => { setS({ ...s, flight_id: flight.id }); toast.success("Sim data will go to this flight"); }).catch(() => toast.error("Could not switch flight"));

  return (
    <div data-testid="sim-link-chip" className="flex flex-wrap items-center gap-2 rounded-full bg-white px-4 py-1.5 font-mono text-xs shadow-sm dark:bg-slate-900">
      <Cable className={`h-4 w-4 ${s.online ? "text-emerald-500" : "text-slate-400"}`} />
      <span data-testid="sim-link-chip-status" className="text-slate-700 dark:text-slate-200">{s.online ? `Sim linked · ${s.aircraft || s.sim}` : "Sim helper offline"}</span>
      {here ? <span className="text-emerald-600 dark:text-emerald-400">· filling this flight</span> : (
        <button data-testid="sim-link-target" onClick={target} className="min-h-[36px] rounded-full bg-emerald-500 px-3 font-bold text-white">Send sim data here</button>
      )}
    </div>
  );
}
