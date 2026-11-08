import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Radio, Send, UserCheck, ExternalLink, RefreshCw } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache, useTheme } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import { Panel, inputCls, btnPrimary, btnGhost } from "@/components/flight/ui";
import { tiles, planeIcon } from "@/components/flight/RouteMap";

const hhmm = (s) => { const n = parseInt(s, 10) || 0; return `${String(Math.floor(n / 3600)).padStart(2, "0")}${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}`; };

// Builds the myVATSIM prefile link; the pilot reviews and submits it on VATSIM (they have no public filing API)
function prefileUrl(f, cid) {
  const cruise = f.waypoints.find((w) => Number(w.altitude) >= Number(f.cruise_level || 0) - 100) || {};
  const speed = `N${String(cruise.tas || 450).padStart(4, "0")}`;
  const fl = Math.round((f.cruise_level || 0) / 100);
  const dep = (f.times?.sched_off || "0000").replace(":", "");
  const raw = `(FPL-${f.callsign}-IS -${f.aircraft}/M-SDE3FGHIRWY/LB1 -${f.origin}${dep} -${speed}F${String(fl).padStart(3, "0")} ${f.route} -${f.destination}${hhmm(f.ete)} ${f.alternate || ""} -PBN/A1B1C1D1O1S1 RMK/TCAS FILED VIA NAVDECK)`;
  const q = new URLSearchParams({ raw, cid: cid || "", callsign: f.callsign || "", aircraft: f.aircraft || "", departure: f.origin, arrival: f.destination, alternate: f.alternate || "", altitude: String(f.cruise_level || ""), speed, route: f.route || "", deptime: dep, enroute_time: hhmm(f.ete), fuel_time: hhmm(Number(f.ete || 0) + 3600), flight_rules: "I", remarks: "TCAS FILED VIA NAVDECK" });
  return `https://my.vatsim.net/pilots/flightplan?${q.toString()}`;
}

export default function VatsimPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const { theme } = useTheme();
  const [cid, setCid] = useState(cache.getProfile()?.vatsim_cid || "");
  const [member, setMember] = useState(null);
  const [feed, setFeed] = useState(null);
  const flights = cache.getFlights().filter((f) => f.status !== "closed");
  const [flightId, setFlightId] = useState(flights[0]?.id || "");

  const loadFeed = () => api.get("/vatsim/pilots").then((r) => setFeed(r.data)).catch(() => toast.error("VATSIM feed unavailable"));
  const lookup = async (id = cid) => {
    if (!id) return;
    try { setMember((await api.get(`/vatsim/member/${id}`)).data); } catch (e) { toast.error(e.response?.data?.detail || "CID lookup failed"); }
  };
  useEffect(() => {
    loadFeed();
    api.get("/me").then((r) => { cache.setProfile(r.data); if (r.data.vatsim_cid) { setCid(r.data.vatsim_cid); lookup(r.data.vatsim_cid); } }).catch(() => {});
    const t = setInterval(loadFeed, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const saveCid = async () => {
    if (!/^\d{6,8}$/.test(cid)) return toast.error("A VATSIM CID is 6–8 digits");
    const r = await api.put("/me", { vatsim_cid: cid });
    cache.setProfile(r.data);
    toast.success("CID imported");
    lookup();
  };
  const flight = flights.find((f) => f.id === flightId);
  const me = member?.online;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400">Network</div>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">VATSIM</h1>
          </div>
          <div className="flex gap-2 font-mono text-sm">
            <span data-testid="vatsim-pilot-count" className="rounded-full bg-white dark:bg-slate-900 px-4 py-2 font-bold text-slate-800 dark:text-slate-100">{feed?.pilots.length ?? "–"} pilots</span>
            <span className="rounded-full bg-white dark:bg-slate-900 px-4 py-2 font-bold text-slate-800 dark:text-slate-100">{feed?.controllers ?? "–"} ATC</span>
            <button data-testid="vatsim-refresh" onClick={loadFeed} className={btnGhost}><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
        <div data-testid="vatsim-map" className="h-[460px] overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-slate-800">
          <MapContainer center={me ? [me.lat, me.lon] : [35, 0]} zoom={me ? 6 : 2} preferCanvas style={{ height: "100%", width: "100%" }}>
            <TileLayer url={tiles(theme)} attribution="Tiles &copy; Esri · VATSIM data" />
            {(feed?.pilots || []).map((p) => (
              <CircleMarker key={p.cid} center={[p.lat, p.lon]} radius={3} pathOptions={{ color: "#6366f1", weight: 1, fillOpacity: 0.8 }}>
                <Tooltip>{p.callsign} · {p.aircraft || "?"} · {p.dep || "?"}→{p.arr || "?"} · FL{Math.round(p.alt / 100)} · {p.gs}kt</Tooltip>
              </CircleMarker>
            ))}
            {me && <Marker position={[me.lat, me.lon]} icon={planeIcon(me.hdg, "#d946ef", 34)} />}
          </MapContainer>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Your VATSIM account" icon={UserCheck} tone="emerald" testId="vatsim-cid-panel">
            <div className="flex gap-2">
              <input data-testid="vatsim-cid-input" value={cid} onChange={(e) => setCid(e.target.value.trim())} inputMode="numeric" placeholder="VATSIM CID e.g. 1234567" className={inputCls} />
              <button data-testid="vatsim-cid-save" onClick={saveCid} className={btnPrimary}>Import CID</button>
            </div>
            {member && (
              <div data-testid="vatsim-member-info" className="mt-4 grid grid-cols-2 gap-3 font-mono text-sm">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3"><div className="text-xs text-slate-500">CID</div><b className="text-slate-900 dark:text-white">{member.cid}</b></div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3"><div className="text-xs text-slate-500">Region / division</div><b className="text-slate-900 dark:text-white">{member.region} · {member.division}</b></div>
                <div className={`col-span-2 rounded-2xl p-3 ${me ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800/60 text-slate-500"}`}>
                  <Radio className="mr-1 inline h-4 w-4" /> {me ? `Online as ${me.callsign} · FL${Math.round(me.alt / 100)} · ${me.gs} kt` : "Not connected to VATSIM right now"}
                </div>
              </div>
            )}
          </Panel>
          <Panel title="File flight plan to VATSIM" icon={Send} tone="violet" testId="vatsim-prefile-panel">
            {flights.length === 0 ? (
              <p className="text-sm text-slate-500">Import a SimBrief OFP first.</p>
            ) : (
              <>
                <select data-testid="vatsim-flight-select" value={flightId} onChange={(e) => setFlightId(e.target.value)} className={inputCls}>
                  {flights.map((f) => <option key={f.id} value={f.id}>{f.callsign} · {f.origin} → {f.destination}</option>)}
                </select>
                {flight && (
                  <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 font-mono text-xs text-slate-600 dark:text-slate-300 break-words">
                    {flight.callsign} · {flight.aircraft} · {flight.origin}→{flight.destination} ALTN {flight.alternate} · FL{Math.round((flight.cruise_level || 0) / 100)}<br />{flight.route}
                  </div>
                )}
                <a data-testid="vatsim-file-button" href={flight ? prefileUrl(flight, cid) : "#"} target="_blank" rel="noreferrer" className={`${btnPrimary} mt-3 w-full`}>
                  <ExternalLink className="h-4 w-4" /> File on myVATSIM
                </a>
                <p className="mt-2 text-xs text-slate-500">Opens VATSIM's prefile form already filled in from your OFP. Sign in with your VATSIM account there and press Send to file it.</p>
              </>
            )}
          </Panel>
        </div>
      </main>
    </div>
  );
}
