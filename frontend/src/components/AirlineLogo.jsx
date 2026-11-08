import { useEffect, useState } from "react";

// Resolve the airline code from the OFP, or from an airline-style callsign (e.g. BAW123 → BAW)
export function airlineCode(f) {
  if (f?.airline_icao) return f.airline_icao.toUpperCase();
  const m = /^([A-Z]{3})\d/.exec(f?.callsign || "");
  return m ? m[1] : null;
}

const sources = (code) =>
  code.length === 2
    ? [`https://pics.avs.io/400/160/${code}.png`]
    : [`https://www.flightaware.com/images/airline_logos/180px/${code}.png`, `https://www.flightaware.com/images/airline_logos/90p/${code}.png`];

const SIZES = { sm: "h-6 max-w-[96px]", md: "h-8 max-w-[140px]", lg: "h-12 max-w-[200px]", xl: "h-16 max-w-[240px]" };

export default function AirlineLogo({ flight, size = "md", className = "" }) {
  const code = airlineCode(flight);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [code]);
  const list = code ? sources(code) : [];
  const h = SIZES[size] || SIZES.md;

  if (!code || idx >= list.length) {
    return (
      <span
        data-testid="airline-logo-fallback"
        className={`inline-flex ${h} min-w-[64px] items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 px-3 font-heading text-sm font-extrabold tracking-wider text-white ${className}`}
      >
        {code || flight?.aircraft || "GA"}
      </span>
    );
  }
  return (
    <img
      data-testid="airline-logo"
      src={list[idx]}
      alt={`${code} logo`}
      onError={() => setIdx((i) => i + 1)}
      className={`${h} w-auto object-contain ${className}`}
    />
  );
}

// White pill so logos stay readable in night mode and on dark headers
export function LogoPill({ flight, size = "md" }) {
  return (
    <span className="inline-flex items-center rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70">
      <AirlineLogo flight={flight} size={size} />
    </span>
  );
}
