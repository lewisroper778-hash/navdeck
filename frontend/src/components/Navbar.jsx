import { Link, NavLink } from "react-router-dom";
import { UserButton, useUser } from "@clerk/react";
import { Plane, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/utils-app";
import { NAV } from "@/constants/testIds";

export default function Navbar() {
  const { user } = useUser();
  const { theme, toggle } = useTheme();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-6 lg:px-10">
        <Link to="/" data-testid={NAV.logo} className="flex items-center gap-2.5 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-fuchsia-500 text-white shadow-sm shadow-sky-900/20 transition-transform group-hover:scale-105">
            <Plane className="h-5 w-5 -rotate-45" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-heading text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">
              e-navlog
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              EFB · v1.2
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-900 p-1">
          <NavLink
            to="/"
            end
            data-testid={NAV.dashboardLink}
            className={({ isActive }) =>
              `rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`
            }
          >
            Flights
          </NavLink>
          <NavLink
            to="/settings"
            data-testid={NAV.settingsLink}
            className={({ isActive }) =>
              `rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`
            }
          >
            SimBrief
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <span
            data-testid="online-status"
            className={`hidden sm:flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest ${
              online ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Live" : "Offline"}
          </span>
          <button
            onClick={toggle}
            data-testid="theme-toggle"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="toggle theme"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          {user && (
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Pilot
              </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {user.fullName || user.primaryEmailAddress?.emailAddress?.split("@")[0]}
              </span>
            </div>
          )}
          <div data-testid="user-menu">
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  );
}
