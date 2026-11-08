import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { useTheme } from "@/lib/utils-app";

export const tiles = (theme) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${theme === "dark" ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

export const planeIcon = (hdg = 0, color = "#6366f1", size = 26) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${hdg}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path fill="${color}" stroke="white" stroke-width="1" d="M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2l-7.7-2.3V18l2.2 1.7V21L12 20l-3.5 1v-1.3L10.7 18v-4.5L3 15.8v-2l7.7-4.6V4c0-1.1.5-2 1.3-2z"/></svg>`,
  });

function Fit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
  }, [map, points]);
  return null;
}

const bearing = ([a1, o1], [a2, o2]) => {
  const r = Math.PI / 180;
  const y = Math.sin((o2 - o1) * r) * Math.cos(a2 * r);
  const x = Math.cos(a1 * r) * Math.sin(a2 * r) - Math.sin(a1 * r) * Math.cos(a2 * r) * Math.cos((o2 - o1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

// Route on a map; the aircraft sits at the last fix ticked off and points to the next one
export default function RouteMap({ rows }) {
  const { theme } = useTheme();
  const pts = rows.filter((r) => r.lat != null && r.lon != null);
  if (pts.length < 2)
    return <div data-testid="route-map-empty" className="rounded-3xl bg-slate-50 dark:bg-slate-800/60 p-6 text-sm text-slate-500">Re-sync this OFP from the Flights page to load the route map coordinates.</div>;
  const line = pts.map((p) => [p.lat, p.lon]);
  const lastIdx = pts.map((p) => p.passed).lastIndexOf(true);
  const done = line.slice(0, lastIdx + 1);
  const pos = lastIdx >= 0 ? line[lastIdx] : line[0];
  const next = line[Math.min(lastIdx + 1, line.length - 1)];
  return (
    <div data-testid="route-map" className="h-[380px] overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800">
      <MapContainer center={pos} zoom={5} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={tiles(theme)} attribution="Tiles &copy; Esri" />
        <Fit points={line} />
        <Polyline positions={line} pathOptions={{ color: "#94a3b8", weight: 3, dashArray: "6 6" }} />
        {done.length > 1 && <Polyline positions={done} pathOptions={{ color: "#8b5cf6", weight: 4 }} />}
        {pts.map((p, i) => (
          <CircleMarker key={i} center={[p.lat, p.lon]} radius={3.5} pathOptions={{ color: p.passed ? "#8b5cf6" : "#64748b", fillOpacity: 1 }}>
            <Tooltip>{p.ident}{p.ata ? ` · ATA ${p.ata}` : p.eto ? ` · ETO ${p.eto}` : ""}</Tooltip>
          </CircleMarker>
        ))}
        <Marker position={pos} icon={planeIcon(bearing(pos, next === pos ? line[1] : next), "#d946ef", 30)} />
      </MapContainer>
    </div>
  );
}
