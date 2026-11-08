import { Link } from "react-router-dom";
import { SignIn } from "@clerk/react";
import NavdeckLogo from "@/components/NavdeckLogo";

export function AuthShell({ mode, children }) {
  const tab = (to, label, active, id) => (
    <Link to={to} data-testid={id} className={`flex-1 rounded-full py-2.5 text-center text-sm font-semibold transition-colors ${active ? "bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 text-white shadow" : "text-slate-300 hover:text-white"}`}>{label}</Link>
  );
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-cyan-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-2">
        <div>
          <NavdeckLogo size={56} light />
          <h1 className="mt-10 font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
            Your flight deck,<br /><span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">from gate to gate.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/70">Plan with SimBrief, file on VATSIM, fly an electronic navlog step by step and keep every signed report in your logbook.</p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[["SimBrief", "1-tap OFP"], ["VATSIM", "Live map"], ["AI", "Co-pilot"]].map(([a, b]) => (
              <div key={a} className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur"><div className="font-heading font-bold">{a}</div><div className="text-xs text-white/60">{b}</div></div>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-md">
          <div className="mb-4 flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
            {tab("/sign-in", "Log in", mode === "in", "auth-tab-login")}
            {tab("/sign-up", "Create account", mode === "up", "auth-tab-signup")}
          </div>
          <div className="flex justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <AuthShell mode="in">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </AuthShell>
  );
}
