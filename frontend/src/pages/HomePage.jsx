import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/react";
import { Clock, Gauge, Trophy, PlaneTakeoff, Route as RouteIcon, ArrowRight } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import { useNow } from "@/components/flight/TimeTiles";
import { currentPhase } from "@/lib/phases";
import { TONES } from "@/components/flight/ui";

const hm = (m) => (m == null ? "—" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

function ZuluClock() {
  const now = useNow();
  const d = new Date(now);
  return (
    <div data-testid="home-zulu" className="rounded-[28px] bg-slate-900 dark:bg-black/50 p-6 text-white">
      <div className="text-xs font-semibold text-white/60">Time in Zulu</div>
      <div className="mt-1 font-mono text-5xl font-bold tabular-nums">{d.toISOString().slice(11, 19)}<span className="text-cyan-400">Z</span></div>
      <div className="mt-1 font-mono text-xs text-white/50">{d.toISOString().slice(0, 10)} · local {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

export default function HomePage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const [stats, setStats] = useState(() => cache.getProfile()?.stats || null);
  const recent = cache.getFlights().filter((f) => f.status !== "closed").slice(0, 3);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
  }, [api]);

  const cards = [
    ["Flight time", hm(stats?.block_minutes), `${hm(stats?.air_minutes)} airborne`, Clock, "from-cyan-500 to-sky-500", "stat-flight-time"],
    ["Avg landing rate", stats?.avg_landing_rate != null ? `-${stats.avg_landing_rate} fpm` : "—", `${stats?.landings ?? 0} landings`, Gauge, "from-indigo-500 to-violet-500", "stat-avg-landing"],
    ["Best landing", stats?.best_landing_rate != null ? `-${stats.best_landing_rate} fpm` : "—", "softest touchdown", Trophy, "from-fuchsia-500 to-pink-500", "stat-best-landing"],
    ["Flights flown", stats?.flights_closed ?? "—", `${(stats?.distance_nm ?? 0).toLocaleString()} nm`, RouteIcon, "from-emerald-500 to-teal-500", "stat-flights"],
  ];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 md:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-indigo-950 to-fuchsia-950 p-8 text-white lg:col-span-2">
            <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-cyan-400/25 blur-3xl" />
            <div className="relative">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-300">Welcome back, Captain</div>
              <h1 className="mt-2 font-heading text-4xl sm:text-5xl font-extrabold tracking-tight">{user?.firstName || user?.fullName || "Pilot"}</h1>
              <p className="mt-2 max-w-lg text-white/70">Plan in SimBrief, fly the process, file on VATSIM and keep every signed report in your logbook.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button data-testid="home-plan-button" onClick={() => navigate("/settings")} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-5 font-semibold text-indigo-700"><PlaneTakeoff className="h-4 w-4" /> Plan a flight</button>
                <button data-testid="home-flights-button" onClick={() => navigate("/flights")} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white/15 px-5 font-semibold hover:bg-white/25">My flights <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
          <ZuluClock />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map(([l, v, s, Icon, g, id]) => (
            <div key={l} data-testid={id} className={`rounded-[28px] bg-gradient-to-br ${g} p-5 text-white shadow-lg`}>
              <Icon className="h-6 w-6 text-white/80" />
              <div className="mt-3 text-sm font-semibold text-white/80">{l}</div>
              <div className="font-mono text-3xl font-bold">{v}</div>
              <div className="font-mono text-xs text-white/75">{s}</div>
            </div>
          ))}
        </div>
        <section>
          <h2 className="mb-3 font-heading text-lg font-bold text-slate-900 dark:text-white">Flights in progress</h2>
          {recent.length === 0 ? (
            <p className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">No open flights. Plan one in SimBrief and it will appear here.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {recent.map((f) => {
                const p = currentPhase(f);
                return (
                  <button key={f.id} data-testid={`home-flight-${f.id}`} onClick={() => navigate(`/flights/${f.id}`)} className="rounded-3xl bg-white dark:bg-slate-900 p-5 text-left shadow-sm hover:-translate-y-0.5 transition-transform">
                    <div className="flex justify-between"><span className="font-heading text-2xl font-extrabold text-slate-900 dark:text-white">{f.origin} → {f.destination}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${TONES[p.tone].chip}`}>{p.label}</span></div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{f.callsign} · {f.aircraft}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
