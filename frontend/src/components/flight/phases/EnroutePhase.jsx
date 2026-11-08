import FuelPanel from "../FuelPanel";
import NavlogTable from "../NavlogTable";
import { signedDev } from "../ui";
import RouteMap from "../RouteMap";

export default function EnroutePhase({ ctx }) {
  const { f, rows, fuelCalc, u, logWp, toggleWp } = ctx;
  const next = rows.find((r) => !r.passed);
  const passed = rows.filter((r) => r.passed).length;
  const logged = rows.filter((r) => r.timeDev !== null && r.ata);
  const tDev = logged.length ? logged[logged.length - 1].timeDev : null;
  const dest = rows[rows.length - 1];
  const fuelGrad = fuelCalc.state === "MAYDAY FUEL" || fuelCalc.dev < -500 ? "from-rose-500 to-red-500" : fuelCalc.state === "MINIMUM FUEL" || fuelCalc.dev < 0 ? "from-amber-500 to-orange-500" : "from-emerald-500 to-teal-500";
  const cards = [
    ["Next fix", next?.ident || "—", next ? `ETO ${next.eto || "—"}` : "All fixes passed", "from-violet-500 to-fuchsia-500"],
    ["Progress", `${passed}/${rows.length}`, `${rows.length ? Math.round((passed / rows.length) * 100) : 0}% of route`, "from-sky-500 to-cyan-500"],
    ["Time deviation", tDev === null ? "—" : signedDev(tDev, " min"), `ETA ${f.destination} ${dest?.eto || "—"}`, "from-indigo-500 to-blue-500"],
    ["Fuel deviation", signedDev(u.toDisp(fuelCalc.dev)), `${u.units} vs plan · ${fuelCalc.state}`, fuelGrad],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([l, v, s, g], i) => (
          <div key={l} data-testid={`enroute-card-${i}`} className={`rounded-3xl bg-gradient-to-br ${g} p-5 text-white shadow-md`}>
            <div className="text-xs font-semibold text-white/80">{l}</div>
            <div className="mt-1 font-mono text-3xl font-bold">{v}</div>
            <div className="mt-1 font-mono text-[11px] text-white/80">{s}</div>
          </div>
        ))}
      </div>
      <RouteMap rows={rows} />
      <NavlogTable rows={rows} u={u} onLog={logWp} onToggle={toggleWp} />
      <FuelPanel flight={f} rows={rows} fuelCalc={fuelCalc} u={u} mode="check" />
    </div>
  );
}
