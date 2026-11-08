import AirlineLogo from "@/components/AirlineLogo";
import { signedDev } from "./ui";

const Cell = ({ l, v }) => (
  <div className="border border-slate-300 px-2 py-1">
    <div className="text-[8px] uppercase tracking-widest text-slate-500">{l}</div>
    <div className="text-[11px] font-bold">{v ?? "—"}</div>
  </div>
);

export default function FlightReport({ flight, rows, fuelCalc, wc, u, mode }) {
  const t = flight.times || {};
  const s = flight.signoff || {};
  const d = (v) => u.toDisp(v)?.toLocaleString() ?? "—";
  return (
    <div className="hidden print:block font-mono text-black bg-white text-[10px]" data-testid="print-report">
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-3">
          <AirlineLogo flight={flight} size="lg" />
          <div>
            <div className="font-heading text-lg font-bold">
              {mode === "report" ? "End-of-Flight Report" : "Operational Navlog"}
            </div>
            <div>{flight.callsign} · {flight.origin} → {flight.destination} · ALTN {flight.alternate || "—"}</div>
          </div>
        </div>
        <div className="text-right">
          <div>{flight.aircraft} {flight.aircraft_name ? `· ${flight.aircraft_name}` : ""}</div>
          <div>OFP #{flight.raw_simbrief_id || "—"} · units {u.units}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-9 gap-0">
        <Cell l="Sched OFF" v={t.sched_off} />
        <Cell l="Gate out" v={t.off} />
        <Cell l="T-O" v={t.takeoff} />
        <Cell l="LDG" v={t.landing} />
        <Cell l="Gate in" v={t.on} />
        <Cell l="TSAT" v={t.tsat} />
        <Cell l="CTOT" v={t.ctot} />
        <Cell l="Landing rate" v={flight.landing_rate ? `-${Math.abs(flight.landing_rate)} fpm` : null} />
        <Cell l="Fuel state" v={fuelCalc.state} />
        <Cell l="Block fuel" v={d(flight.fuel?.block)} />
        <Cell l="Trip" v={d(flight.fuel?.trip)} />
        <Cell l="Min fuel" v={d(fuelCalc.minFuel)} />
        <Cell l="Mayday" v={d(fuelCalc.mayday)} />
        <Cell l="Est landing" v={d(fuelCalc.landing)} />
        <Cell l="Fuel at gate" v={flight.arrival_fob ? d(flight.arrival_fob) : null} />
        <Cell l="ZFW" v={d(wc.zfw.value)} />
        <Cell l="TOW" v={d(wc.tow.value)} />
        <Cell l="LAW" v={d(wc.law.value)} />
      </div>

      <div className="mt-2 break-all"><b>RTE</b> {flight.route}</div>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-[8px] uppercase">
            {["Fix", "Awy", "FL", "Wind", "GS", "Dist", "Plan", "ETO", "ATA", "ΔT", "Plan FOB", "Act FOB", "ΔF"].map((h) => (
              <th key={h} className="px-1 py-0.5 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-300">
              <td className="px-1 font-bold">{r.ident}</td>
              <td className="px-1">{r.airway || "DCT"}</td>
              <td className="px-1">{r.altitude ? Math.round(r.altitude / 100) : ""}</td>
              <td className="px-1">{r.wind}</td>
              <td className="px-1">{r.gs}</td>
              <td className="px-1">{r.distance}</td>
              <td className="px-1">{r.planned}</td>
              <td className="px-1">{r.eto}</td>
              <td className="px-1 font-bold">{r.ata}</td>
              <td className="px-1">{r.timeDev === null ? "" : signedDev(r.timeDev)}</td>
              <td className="px-1">{d(r.fob)}</td>
              <td className="px-1 font-bold">{r.actual_fob ? d(r.actual_fob) : ""}</td>
              <td className="px-1">{r.fuelDev === null ? "" : signedDev(u.toDisp(r.fuelDev))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {mode === "report" && (
        <div className="mt-6 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500">Remarks</div>
            <div className="mt-1 min-h-[40px] border border-slate-300 p-2 font-sans">{s.remarks || "Nil"}</div>
          </div>
          <div>
            {s.signature ? <img src={s.signature} alt="" className="h-16 border-b border-black" /> : <div className="font-signature text-3xl border-b border-black pb-1">{s.signed_by || ""}</div>}
            <div className="text-[10px]">{flight.arrival_notes?.metar ? `WX ${flight.arrival_notes.metar}` : ""} {flight.arrival_notes?.runway ? `· RWY ${flight.arrival_notes.runway}` : ""} {flight.arrival_notes?.notes || ""}</div>
            <div className="mt-1 flex justify-between text-[9px]">
              <span>Commander signature</span>
              <span>{s.signed_at ? `${s.signed_at.replace("T", " ").slice(0, 16)}z` : "UNSIGNED"}</span>
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 text-[8px] text-slate-500">Generated by NAVDECK · For flight simulation use only</div>
    </div>
  );
}
