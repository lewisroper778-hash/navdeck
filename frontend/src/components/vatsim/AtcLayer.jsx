import { GeoJSON, Circle, Tooltip } from "react-leaflet";

const has = (a, types) => a.positions.some((p) => types.includes(p.type));

const PositionList = ({ title, positions }) => (
  <div className="font-mono text-xs">
    <b>{title}</b>
    {positions.map((p) => <div key={p.callsign}>{p.callsign} · {p.freq} · {p.controller}</div>)}
  </div>
);

export default function AtcLayer({ atc }) {
  if (!atc) return null;
  return (
    <>
      {atc.sectors.map((s) => (
        <GeoJSON key={s.callsign} data={{ type: "FeatureCollection", features: s.geometries.map((g) => ({ type: "Feature", geometry: g, properties: {} })) }}
          style={{ color: "#10b981", weight: 1.2, fillColor: "#10b981", fillOpacity: 0.12 }}>
          <Tooltip sticky><PositionList title={s.name} positions={[s]} /></Tooltip>
        </GeoJSON>
      ))}
      {atc.airports.filter((a) => has(a, ["APP", "DEP"])).map((a) => (
        <Circle key={`app-${a.icao}`} center={[a.lat, a.lon]} radius={70000} pathOptions={{ color: "#f59e0b", weight: 1.2, fillOpacity: 0.1, dashArray: "4 4" }}>
          <Tooltip sticky><PositionList title={`${a.icao} · ${a.name}`} positions={a.positions} /></Tooltip>
        </Circle>
      ))}
      {atc.airports.filter((a) => has(a, ["TWR"])).map((a) => (
        <Circle key={`twr-${a.icao}`} center={[a.lat, a.lon]} radius={16000} pathOptions={{ color: "#ef4444", weight: 1.5, fillOpacity: 0.25 }}>
          <Tooltip sticky><PositionList title={`${a.icao} · ${a.name}`} positions={a.positions} /></Tooltip>
        </Circle>
      ))}
    </>
  );
}
