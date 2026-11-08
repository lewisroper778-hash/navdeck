export default function NavdeckLogo({ size = 40, wordmark = true, light = false }) {
  return (
    <span className="inline-flex items-center gap-2.5" data-testid="navdeck-logo">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="nd-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.55" stopColor="#6366f1" />
            <stop offset="1" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#nd-g)" />
        <circle cx="24" cy="24" r="14" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 3" />
        <path d="M24 9 L28 24 L24 21 L20 24 Z" fill="white" />
        <path d="M24 39 L20 24 L24 27 L28 24 Z" fill="white" fillOpacity="0.55" />
        <circle cx="24" cy="24" r="2.2" fill="white" />
      </svg>
      {wordmark && (
        <span className="flex flex-col leading-none">
          <span className={`font-heading text-[17px] font-extrabold tracking-[0.12em] ${light ? "text-white" : "text-slate-900 dark:text-white"}`}>NAVDECK</span>
          <span className={`font-mono text-[9px] uppercase tracking-[0.25em] ${light ? "text-white/60" : "text-slate-500 dark:text-slate-400"}`}>Flight Sim EFB</span>
        </span>
      )}
    </span>
  );
}
