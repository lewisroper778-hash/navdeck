import { SignIn } from "@clerk/react";

export default function SignInPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-sky-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5 -rotate-45">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
            </div>
            <h1 className="font-heading text-xl font-bold tracking-tight">e-navlog</h1>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Electronic Flight Bag · Flight Simulator
          </p>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="font-heading text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
            Your SimBrief flight plans.
            <br />
            <span className="text-sky-400">Pilot-ready navlogs.</span>
          </h2>
          <p className="max-w-md text-slate-400 leading-relaxed">
            Import OFPs from SimBrief with a single click. Track every waypoint during the sim session.
            Print the navlog like the real deal.
          </p>
          <div className="grid grid-cols-3 gap-6 border-t border-slate-800 pt-6">
            <Stat label="OFP Import" value="1-click" />
            <Stat label="Waypoints" value="Live" />
            <Stat label="Export" value="PDF" />
          </div>
        </div>

        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(14,165,233,0.25) 0%, transparent 50%)" }} />
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-heading text-lg font-bold text-white mt-1">{value}</div>
    </div>
  );
}
