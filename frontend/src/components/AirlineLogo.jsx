import { useState } from "react";
import { airlineLogoUrl } from "@/lib/utils-app";
import { Plane } from "lucide-react";

export default function AirlineLogo({ icao, size = "md", className = "" }) {
  const [err, setErr] = useState(false);
  const url = airlineLogoUrl(icao);
  const sizes = { sm: "h-5", md: "h-7", lg: "h-10", xl: "h-14" };
  const h = sizes[size] || sizes.md;
  if (!icao || err || !url) {
    return (
      <div className={`${h} aspect-[4/1] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-sm px-2 ${className}`}>
        <Plane className="h-4 w-4 text-slate-400 -rotate-45" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${icao} logo`}
      onError={() => setErr(true)}
      className={`${h} object-contain ${className}`}
    />
  );
}
