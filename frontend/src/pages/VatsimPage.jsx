import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { MapContainer, TileLayer, Tooltip, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Radio, RadioTower, Send, UserCheck, ExternalLink, RefreshCw } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache, useTheme } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import { Panel, inputCls, btnPrimary, btnGhost } from "@/components/flight/ui";
import { tiles, planeIcon } from "@/components/flight/RouteMap";
import AtcLayer from "@/components/vatsim/AtcLayer";
import TrafficPopup from "@/components/vatsim/TrafficPopup";
import TrafficSearch from "@/components/vatsim/TrafficSearch";
import TrafficFilter, { parseAirports } from "@/components/vatsim/TrafficFilter";
import FriendsPanel from "@/components/vatsim/FriendsPanel";

const iconCache = {};
const trafficIcon = (hdg, friend) => { const k = Math.round((Number(hdg) || 0) / 5) * 5; const key = `${k}${friend ? "f" : ""}`; return (iconCache[key] ||= planeIcon(k, friend ? "#10b981" : "#6366f1", friend ? 24 : 18)); };

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
  const [all, setAll] = useState(() => cache.getFlights());
  const flights = all.filter((f) => f.status !== "closed");
  const [flightId, setFlightId] = useState("");

  const loadFeed = () => {
    api.get("/vatsim/pilots").then((r) => setFeed(r.data)).catch(() => toast.error("VATSIM feed unavailable"));
    api.get("/vatsim/atc").then((r) => setAtc(r.data)).catch(() => {});
  };
  const [atc, setAtc] = useState(null);
  const [showAtc, setShowAtc] = useState(true);
  const [map, setMap] = useState(null);
  const [selectedCid, setSelectedCid] = useState(null);
  const [followCid, setFollowCid] = useState(null);
  const [friends, setFriends] = useState(cache.getProfile()?.vatsim_friends || []);
  const [filterText, setFilterText] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const pendingFocus = useRef(null);
  const seenFriends = useRef(null);
  const pilots = feed?.pilots || [];
  const isFriend = (p) => friends.includes(String(p.cid)) || friends.includes(p.callsign);
  const codes = parseAirports(filterText);
  const visible = codes.length ? pilots.filter((p) => codes.includes(p.dep) || codes.includes(p.arr) || p.cid === followCid || p.cid === selectedCid) : pilots;
  const selected = pilots.find((p) => p.cid === selectedCid);
  const focusPilot = (p) => {
    if (!map) return setSelectedCid(p.cid);
    if (p.cid !== followCid) setFollowCid(null);
    setSelectedCid(null);
    if (pendingFocus.current) map.off("moveend", pendingFocus.current);
    pendingFocus.current = () => setSelectedCid(p.cid);
    map.once("moveend", pendingFocus.current);
    map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 7), { duration: 1.2 });
  };
  const lookup = async (id = cid) => {
    if (!id) return;
    try { setMember((await api.get(`/vatsim/member/${id}`)).data); } catch (e) { toast.error(e.response?.data?.detail || "CID lookup failed"); }
  };
  useEffect(() => {
    loadFeed();
    api.get("/flights").then((r) => { cache.setFlights(r.data); setAll(r.data); }).catch(() => {});
    api.get("/me").then((r) => { cache.setProfile(r.data); setFriends(r.data.vatsim_friends || []); setProfileLoaded(true); if (r.data.vatsim_cid) { setCid(r.data.vatsim_cid); lookup(r.data.vatsim_cid); } }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const t = setInterval(loadFeed, followCid ? 15000 : 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [followCid]);

  useEffect(() => {
    if (!map) return;
    const stop = () => setFollowCid(null);
    map.on("dragstart", stop);
    return () => map.off("dragstart", stop);
  }, [map]);

  useEffect(() => {
    if (!followCid || !feed || !map) return;
    const p = pilots.find((x) => x.cid === followCid);
    if (p) map.panTo([p.lat, p.lon], { animate: true, duration: 1 });
    else { setFollowCid(null); toast("The aircraft you were following has disconnected"); }
    // eslint-disable-next-line
  }, [feed, followCid]);

  useEffect(() => {
    if (seenFriends.current !== null) seenFriends.current = new Set(pilots.filter(isFriend).map((p) => p.cid));
    // eslint-disable-next-line
  }, [friends]);

  useEffect(() => {
    if (!feed || !profileLoaded) return;
    const now = pilots.filter(isFriend);
    if (seenFriends.current === null) {
      if (now.length) toast.success(`${now.length} friend${now.length > 1 ? "s" : ""} online: ${now.map((p) => p.callsign).join(", ")}`);
    } else {
      now.filter((p) => !seenFriends.current.has(p.cid)).forEach((p) =>
        toast.success(`${p.callsign} just came online`, { description: `${p.dep || "?"} → ${p.arr || "?"} · ${p.aircraft || ""}`, action: { label: "Show", onClick: () => focusPilot(p) } }));
    }
    seenFriends.current = new Set(now.map((p) => p.cid));
    // eslint-disable-next-line
  }, [feed, profileLoaded]);

  const saveFriends = async (list) => {
    const prev = friends;
    setFriends(list);
    try {
      const r = await api.put("/me", { vatsim_friends: list });
      cache.setProfile(r.data);
      setFriends(r.data.vatsim_friends || []);
    } catch {
      setFriends(prev);
      toast.error("Could not save your friends list");
    }
  };
  const toggleFriend = (p) => saveFriends(isFriend(p) ? friends.filter((f) => f !== String(p.cid) && f !== p.callsign) : [...friends, p.callsign]);
  const toggleFollow = (p) => {
    if (followCid === p.cid) return setFollowCid(null);
    setFollowCid(p.cid);
    map?.setView([p.lat, p.lon], Math.max(map.getZoom(), 7));
  };

  const saveCid = async () => {
    if (!/^\d{6,8}$/.test(cid)) return toast.error("A VATSIM CID is 6–8 digits");
    try {
      const r = await api.put("/me", { vatsim_cid: cid });
      cache.setProfile(r.data);
      toast.success("CID imported");
      lookup();
    } catch {
      toast.error("Could not save your CID");
    }
  };
  const flight = flights.find((f) => f.id === flightId) || flights[0];
  const me = member?.online;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400">Network</div>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">VATSIM</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
            <TrafficSearch pilots={pilots} onPick={focusPilot} />
            <TrafficFilter value={filterText} onChange={setFilterText} shown={visible.length} />
            <span data-testid="vatsim-pilot-count" className="inline-flex h-11 items-center rounded-full bg-white dark:bg-slate-900 px-4 font-bold text-slate-800 dark:text-slate-100">{feed?.pilots.length ?? "–"} pilots</span>
            <span data-testid="vatsim-atc-count" className="inline-flex h-11 items-center rounded-full bg-white dark:bg-slate-900 px-4 font-bold text-slate-800 dark:text-slate-100">{feed?.controllers ?? "–"} ATC</span>
            <button data-testid="vatsim-atc-toggle" onClick={() => setShowAtc((v) => !v)} aria-pressed={showAtc}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-4 font-bold transition-colors ${showAtc ? "bg-emerald-500 text-white" : "bg-white text-slate-500 dark:bg-slate-900"}`}>
              <RadioTower className="h-4 w-4" /> ATC {showAtc ? "on" : "off"}
            </button>
            <button data-testid="vatsim-refresh" onClick={loadFeed} className={btnGhost}><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
        <div data-testid="vatsim-map" className="relative h-[55vh] min-h-[420px] overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-slate-800 md:h-[62vh]">
          {followCid && (
            <button data-testid="vatsim-follow-banner" onClick={() => setFollowCid(null)}
              className="absolute bottom-4 left-1/2 z-[500] inline-flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500 px-5 font-mono text-sm font-bold text-white shadow-lg">
              Following {pilots.find((p) => p.cid === followCid)?.callsign} · tap to stop
            </button>
          )}
          <MapContainer ref={setMap} center={me ? [me.lat, me.lon] : [35, 0]} zoom={me ? 6 : 2} minZoom={2} maxBounds={[[-85, -200], [85, 200]]} maxBoundsViscosity={1} preferCanvas style={{ height: "100%", width: "100%" }}>
            <TileLayer url={tiles(theme)} attribution="Tiles &copy; Esri · VATSIM data · VATSpy" />
            {showAtc && <AtcLayer atc={atc} />}
            {visible.map((p) => (
              <Marker key={p.cid} position={[p.lat, p.lon]} icon={p.cid === selectedCid || p.cid === followCid ? planeIcon(p.hdg, "#f59e0b", 26) : trafficIcon(p.hdg, isFriend(p))} eventHandlers={{ click: () => setSelectedCid(p.cid) }}>
                <Tooltip>{p.callsign} · {p.aircraft || "?"} · {p.dep || "?"}→{p.arr || "?"} · FL{Math.round(p.alt / 100)} · {p.gs}kt</Tooltip>
              </Marker>
            ))}
            {selected && (
              <TrafficPopup key={selected.cid} pilot={selected} onClose={() => setSelectedCid((c) => (c === selected.cid ? null : c))}
                following={followCid === selected.cid} onFollow={() => toggleFollow(selected)} isFriend={isFriend(selected)} onFriend={() => toggleFriend(selected)} />
            )}
            {me && <Marker position={[me.lat, me.lon]} icon={planeIcon(me.hdg, "#d946ef", 34)} />}
          </MapContainer>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <FriendsPanel friends={friends} pilots={pilots} onSave={saveFriends} onPick={focusPilot} />
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
                <select data-testid="vatsim-flight-select" value={flight?.id || ""} onChange={(e) => setFlightId(e.target.value)} className={inputCls}>
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
