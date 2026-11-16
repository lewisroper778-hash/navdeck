import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkFailed, ClerkProvider, useAuth, useClerk } from "@clerk/react";
import { dark } from "@clerk/ui/themes";
import { useTheme } from "@/lib/utils-app";
import Splash, { BLOCKED_NOTE } from "@/components/Splash";
import { reportError } from "@/components/ErrorBoundary";

const appearance = {
  variables: {
    colorPrimary: "#0369A1",
    colorBackground: "#FFFFFF",
    colorForeground: "#0F172A",
    colorInput: "#F8FAFC",
    colorInputForeground: "#0F172A",
    colorBorder: "#E2E8F0",
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    borderRadius: "0.25rem",
  },
};

const darkAppearance = {
  theme: dark,
  variables: { colorPrimary: "#0284C7", fontFamily: appearance.variables.fontFamily, borderRadius: "0.375rem" },
  captcha: { theme: "dark" },
};

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const CONFIG_CACHE_KEY = "navdeck-clerk-public-config-v1";
const CONFIG_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

// Only the PUBLIC Clerk publishable key and proxy path are cached. Never
// store a Clerk JWT, secret key or desktop bridge token in browser storage.
function validConfig(cfg) {
  return !!cfg?.enabled && /^pk_(live|test)_[A-Za-z0-9_-]{10,}$/.test(cfg.publishable_key || "");
}
function readCachedConfig() {
  try {
    const entry = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || "null");
    return entry && Date.now() - entry.savedAt < CONFIG_CACHE_AGE_MS &&
      validConfig(entry.config) ? entry.config : null;
  } catch { return null; }
}

function FailedScreen() {
  useEffect(() => reportError("Clerk failed to load"), []);
  return <Splash overlay retry note={BLOCKED_NOTE} />;
}

// Covers the sign-in pages too if Clerk hangs without reporting a failure
function SlowSignIn() {
  const { isLoaded } = useAuth();
  const { status } = useClerk();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(t);
  }, [isLoaded]);
  return !isLoaded && stuck && status !== "error" ? <Splash overlay retry note={BLOCKED_NOTE} /> : null;
}

export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [config, setConfig] = useState(readCachedConfig);
  const [unavailable, setUnavailable] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (unavailable) reportError("Clerk config unavailable after retries");
  }, [unavailable]);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedConfig();
    const load = async () => {
      // A cached public key lets returning users reach Clerk immediately,
      // even while a free Render backend is waking up.
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const response = await fetch(`${BACKEND_URL}/api/clerk/config`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) throw new Error("Clerk configuration unavailable");
          const cfg = await response.json();
          if (!validConfig(cfg)) throw new Error("Clerk configuration is disabled");
          if (cancelled) return;
          try {
            localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
              savedAt: Date.now(), config: cfg,
            }));
          } catch {}
          setConfig(cfg);
          setUnavailable(false);
          return;
        } catch {
          // A network error is not an invalid account. Keep the login
          // usable from the last known public Clerk configuration.
        } finally {
          clearTimeout(timeout);
        }
        if (attempt < 4) {
          await new Promise(resolve => setTimeout(resolve, Math.min(1500 + attempt * 1000, 4500)));
        }
      }
      if (!cancelled && !cached) setUnavailable(true);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (unavailable)
    return <Splash note="Sign-in is unavailable right now. Refresh the page to try again." />;
  if (!config) return <Splash note={slow ? "Still connecting to sign-in…" : undefined} />;
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={theme === "dark" ? darkAppearance : appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      <ClerkFailed><FailedScreen /></ClerkFailed>
      <SlowSignIn />
      {children}
    </ClerkProvider>
  );
}
