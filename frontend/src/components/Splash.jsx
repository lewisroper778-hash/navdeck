import NavdeckLogo from "@/components/NavdeckLogo";

export const BLOCKED_NOTE = "Can't reach the sign-in service. A content blocker, private DNS or network filter may be blocking it. Turn it off for NAVDECK, then retry.";

export default function Splash({ note, retry, overlay }) {
  return (
    <div data-testid={retry ? "app-signin-unreachable" : "app-splash"} className={`${overlay ? "fixed inset-0 z-[9999]" : "min-h-screen"} grid place-items-center bg-slate-950 p-6 text-white`}>
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className={retry ? "" : "animate-pulse"}><NavdeckLogo size={56} light /></div>
        <p className="font-mono text-xs uppercase leading-relaxed tracking-[0.2em] text-white/60">{note || "Loading flight deck…"}</p>
        {retry && (
          <button data-testid="app-retry-button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-2xl bg-white px-6 font-semibold text-slate-900">Retry</button>
        )}
      </div>
    </div>
  );
}
