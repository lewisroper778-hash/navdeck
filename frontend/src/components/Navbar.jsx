import { Link, NavLink } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/react";
import { Moon, Sun, Users, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/lib/utils-app";
import { makeClient } from "@/lib/api";
import NavdeckLogo from "@/components/NavdeckLogo";
import { UtcClock } from "@/components/flight/TimeTiles";

const LINKS = [
  ["/", "Home", "nav-home-link"],
  ["/flights", "Flights", "nav-dashboard-link"],
  ["/settings", "SimBrief", "nav-settings-link"],
  ["/vatsim", "VATSIM", "nav-vatsim-link"],
  ["/logbook", "Logbook", "nav-logbook-link"],
];

function useOnline() {
  const { getToken } = useAuth();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const [count, setCount] = useState(null);
  const [net, setNet] = useState(navigator.onLine);
  useEffect(() => {
    const beat = () => api.post("/presence").then((r) => setCount(r.data.online)).catch(() => {});
    beat();
    const t = setInterval(beat, 60000);
    const on = () => setNet(true);
    const off = () => setNet(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [api]);
  return { count, net };
}

export default function Navbar() {
  const { theme, toggle } = useTheme();
  const { count, net } = useOnline();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        <Link to="/" data-testid="nav-logo" className="shrink-0"><NavdeckLogo size={38} /></Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-slate-100 dark:bg-slate-900 p-1">
          {LINKS.map(([to, label, id]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={id}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3.5 lg:px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive ? "bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 text-white shadow" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <span data-testid="online-users" className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {net ? <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> : <WifiOff className="h-3 w-3" />}
            <Users className="h-3.5 w-3.5" /> {net ? `${count ?? "–"} online` : "Offline"}
          </span>
          <span className="hidden xl:inline-flex rounded-full bg-slate-100 dark:bg-slate-900 px-3 py-1.5"><UtcClock /></span>
          <button onClick={toggle} data-testid="theme-toggle" aria-label="toggle theme" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <div data-testid="user-menu"><UserButton /></div>
        </div>
      </div>
    </header>
  );
}
