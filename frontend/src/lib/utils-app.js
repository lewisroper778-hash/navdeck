import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("enavlog-theme") || "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("enavlog-theme", theme);
  }, [theme]);
  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function airlineLogoUrl(icao) {
  if (!icao) return null;
  if (icao.length === 2) return `https://pics.avs.io/200/50/${icao}.png`;
  return `https://www.flightaware.com/images/airline_logos/90p/${icao}.png`;
}

// Offline cache, namespaced per signed-in pilot
let cacheUser = "anon";
const k = (s) => `enavlog:${cacheUser}:${s}`;
const read = (s, d) => {
  try { return JSON.parse(localStorage.getItem(k(s))) ?? d; } catch { return d; }
};
const write = (s, v) => {
  try { localStorage.setItem(k(s), JSON.stringify(v)); } catch {}
};
export const cache = {
  setUser: (id) => { cacheUser = id || "anon"; },
  setFlights: (list) => write("flights", list),
  getFlights: () => read("flights", []),
  setFlight: (id, f) => write(`flight:${id}`, f),
  getFlight: (id) => read(`flight:${id}`, null),
  setProfile: (p) => write("profile", p),
  getProfile: () => read("profile", null),
};

// Helpers
export const fmtNum = (n, u = "") => {
  if (n === null || n === undefined || n === "") return "—";
  const v = parseFloat(n);
  if (isNaN(v)) return n;
  return v.toLocaleString() + (u ? ` ${u}` : "");
};

export const nowHHMM = () => new Date().toISOString().slice(11, 16);

export const isHHMM = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "");
export const isNum = (v) => /^\d+(\.\d+)?$/.test(v || "");

export const diffMin = (a, b) => {
  // a, b "HH:MM"
  if (!a || !b) return null;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  let d = (ah * 60 + am) - (bh * 60 + bm);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
};

export const addSecondsToHHMM = (hhmm, seconds) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 3600 + m * 60 + Number(seconds || 0);
  const H = Math.floor((total / 3600) % 24);
  const M = Math.floor((total % 3600) / 60);
  return `${String(((H + 24) % 24)).padStart(2, "0")}:${String(((M + 60) % 60)).padStart(2, "0")}`;
};
