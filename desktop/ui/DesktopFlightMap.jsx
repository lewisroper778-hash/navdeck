import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

function planeIcon(heading = 0, color = "#38bdf8", size = 36) {
  const angle = Number.isFinite(heading) ? heading : 0;
  return L.divIcon({
    className: "navdeck-desktop-aircraft-icon",
    html: `<div style="width:${size}px;height:${size}px;transform:rotate(${angle}deg);filter:drop-shadow(0 2px 5px #0009)"><svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2 L15 10 L22 14 L22 17 L13.5 14.5 L13.5 20 L16 22 L16 23 L12 22 L8 23 L8 22 L10.5 20 L10.5 14.5 L2 17 L2 14 L9 10 Z" fill="${color}" stroke="#e0f2fe" stroke-width=".7"/></svg></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}


const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

function FollowAircraft({ position, follow }) {
  const map = useMap();

  useEffect(() => {
    if (follow && position) {
      map.panTo(position, { animate: true });
    }
  }, [map, position?.[0], position?.[1], follow]);

  return null;
}

function FitRoute({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [45, 45] });
    }
  }, [map, points]);

  return null;
}

export default function DesktopFlightMap({ api, flightId, rows = [] }) {
  const [telemetry, setTelemetry] = useState(null);
  const [follow, setFollow] = useState(true);

  const [desktopTelemetry, setDesktopTelemetry] = useState(null);
  const desktopAvailable = typeof window !== "undefined" &&
    typeof window.navdeckDesktop?.getTelemetry === "function";

  useEffect(() => {
    if (!desktopAvailable) return;
    let active = true;
    let busy = false;
    async function refresh() {
      if (!active || busy) return;
      busy = true;
      try {
        const sample = await window.navdeckDesktop.getTelemetry();
        if (!active) return;
        setDesktopTelemetry(sample && Number.isFinite(sample.lat) &&
          Number.isFinite(sample.lon) && Math.abs(sample.lat) <= 90 &&
          Math.abs(sample.lon) <= 180 ? sample : null);
      } catch { if (active) setDesktopTelemetry(null); }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [desktopAvailable]);

  const points = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            Number.isFinite(Number(row.lat)) &&
            Number.isFinite(Number(row.lon)) &&
            row.lat != null &&
            row.lon != null &&
            !row.skipped
        )
        .map((row) => [Number(row.lat), Number(row.lon)]),
    [rows]
  );

  useEffect(() => {
    let active = true;
    let busy = false;

    setTelemetry(null);

    if (!api || !flightId) return;

    async function refresh() {
      if (busy || !active) return;
      busy = true;

      try {
        const response = await api.get("/bridge/telemetry", {
          timeout: 8000,
        });

        if (!active) return;

        const result = response.data;
        const updated = Date.parse(result?.updated_at);
        const valid =
          result?.live === true &&
          String(result.flight_id) === String(flightId) &&
          Number.isFinite(updated) &&
          Date.now() >= updated &&
          Date.now() - updated <= 15000 &&
          Number.isFinite(result.telemetry?.lat) &&
          Number.isFinite(result.telemetry?.lon) &&
          Math.abs(result.telemetry.lat) <= 90 &&
          Math.abs(result.telemetry.lon) <= 180;

        setTelemetry(valid ? result.telemetry : null);
      } catch {
        if (active) setTelemetry(null);
      } finally {
        busy = false;
      }
    }

    refresh();
    const interval = setInterval(refresh, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [api, flightId]);

  const liveTelemetry = desktopAvailable ? desktopTelemetry : telemetry;
  const position = liveTelemetry
    ? [liveTelemetry.lat, liveTelemetry.lon]
    : null;

  const heading = Number.isFinite(liveTelemetry?.heading_deg)
    ? telemetry.heading_deg
    : 0;

  const initialCenter = points[0] || [51.5, -0.12];

  return (
    <div className="relative h-[70vh] min-h-[500px] overflow-hidden rounded-2xl border border-[#293449] bg-[#111827]">
      <MapContainer
        center={initialCenter}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer url={TILE_URL} attribution="Tiles &copy; Esri" />

        {points.length >= 2 && (
          <>
            <FitRoute points={points} />
            <Polyline
              positions={points}
              pathOptions={{
                color: "#a78bfa",
                weight: 3,
                opacity: 0.9,
              }}
            />
          </>
        )}

        {rows
          .filter(
            (row) =>
              row.lat != null &&
              row.lon != null &&
              Number.isFinite(Number(row.lat)) &&
              Number.isFinite(Number(row.lon)) &&
              !row.skipped
          )
          .map((row, index) => (
            <CircleMarker
              key={index}
              center={[Number(row.lat), Number(row.lon)]}
              radius={4}
              pathOptions={{
                color: "#c4b5fd",
                fillColor: "#a78bfa",
                fillOpacity: 1,
              }}
            >
              <Tooltip>{row.ident || "Waypoint"}</Tooltip>
            </CircleMarker>
          ))}

        {position && (
          <>
            <FollowAircraft position={position} follow={follow} />
            <Marker
              position={position}
              icon={planeIcon(heading, "#38bdf8", 36)}
            >
              <Tooltip>Live simulator aircraft</Tooltip>
            </Marker>
          </>
        )}
      </MapContainer>

      <div className="absolute left-4 top-4 z-[1000] rounded-xl border border-white/10 bg-[#111827]/95 px-4 py-3 text-white shadow-xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          NAVDECK LIVE MAP
        </div>
        <div className="mt-1 text-sm font-bold">
          {liveTelemetry ? "● Aircraft tracking live" : "○ Awaiting simulator telemetry"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFollow((current) => !current)}
        className="absolute right-4 top-4 z-[1000] rounded-lg border border-white/10 bg-[#111827] px-4 py-2 text-sm font-semibold text-white"
      >
        {follow ? "Following aircraft" : "Follow aircraft"}
      </button>

      {liveTelemetry && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] flex flex-wrap gap-3 rounded-xl border border-white/10 bg-[#111827]/95 p-4 text-white shadow-xl">
          <span>ALT {Math.round(liveTelemetry.altitude_ft ?? 0).toLocaleString()} FT</span>
          <span>GS {Math.round(liveTelemetry.groundspeed_kt ?? 0)} KT</span>
          <span>HDG {Math.round(heading)}°</span>
          <span>
            GPS {liveTelemetry.lat.toFixed(3)}, {liveTelemetry.lon.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}
