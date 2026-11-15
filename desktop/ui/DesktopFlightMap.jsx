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
import { planeIcon } from "../../frontend/src/components/flight/RouteMap";

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

  const position = telemetry
    ? [telemetry.lat, telemetry.lon]
    : null;

  const heading = Number.isFinite(telemetry?.heading_deg)
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
          {telemetry ? "● Aircraft tracking live" : "○ Awaiting simulator telemetry"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFollow((current) => !current)}
        className="absolute right-4 top-4 z-[1000] rounded-lg border border-white/10 bg-[#111827] px-4 py-2 text-sm font-semibold text-white"
      >
        {follow ? "Following aircraft" : "Follow aircraft"}
      </button>

      {telemetry && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] flex flex-wrap gap-3 rounded-xl border border-white/10 bg-[#111827]/95 p-4 text-white shadow-xl">
          <span>ALT {Math.round(telemetry.altitude_ft ?? 0).toLocaleString()} FT</span>
          <span>GS {Math.round(telemetry.groundspeed_kt ?? 0)} KT</span>
          <span>HDG {Math.round(heading)}°</span>
          <span>
            GPS {telemetry.lat.toFixed(3)}, {telemetry.lon.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}
