import { Link, NavLink, useNavigate } from "react-router-dom";
import { UserButton, useUser } from "@clerk/react";
import { Plane } from "lucide-react";
import { NAV } from "@/constants/testIds";

export default function Navbar() {
  const { user } = useUser();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-8">
        <Link
          to="/"
          data-testid={NAV.logo}
          className="flex items-center gap-2 group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-sky-700 text-white transition-colors group-hover:bg-sky-800">
            <Plane className="h-5 w-5 -rotate-45" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-heading text-[15px] font-bold tracking-tight text-slate-900">
              e-navlog
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              EFB · v1
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink
            to="/"
            end
            data-testid={NAV.dashboardLink}
            className={({ isActive }) =>
              `rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            My Flights
          </NavLink>
          <NavLink
            to="/settings"
            data-testid={NAV.settingsLink}
            className={({ isActive }) =>
              `rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            SimBrief
          </NavLink>
        </nav>

        <div className="flex items-center gap-4">
          {user && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Pilot
              </span>
              <span className="text-sm font-medium text-slate-800">
                {user.fullName || user.primaryEmailAddress?.emailAddress}
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
