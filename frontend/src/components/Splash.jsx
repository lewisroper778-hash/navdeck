import NavdeckLogo from "@/components/NavdeckLogo";

export default function Splash({ note }) {
  return (
    <div data-testid="app-splash" className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse"><NavdeckLogo size={56} light /></div>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/50">{note || "Loading flight deck…"}</p>
      </div>
    </div>
  );
}
