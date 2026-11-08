import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkFailed, ClerkProvider, useAuth } from "@clerk/react";
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function FailedScreen() {
  useEffect(() => reportError("Clerk failed to load"), []);
  return <Splash overlay retry note={BLOCKED_NOTE} />;
}

// Covers the sign-in pages too if Clerk hangs without reporting a failure
function SlowSignIn() {
  const { isLoaded } = useAuth();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(t);
  }, [isLoaded]);
  return !isLoaded && stuck ? <Splash overlay retry note={BLOCKED_NOTE} /> : null;
}

export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [config, setConfig] = useState(null);
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
    const load = async (attempt = 0) => {
      try {
        const cfg = await (await fetch(`${BACKEND_URL}/api/clerk/config`)).json();
        if (cfg.enabled) return cancelled || setConfig(cfg);
      } catch {}
      if (cancelled) return;
      if (attempt >= 20) return setUnavailable(true);
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => {
      cancelled = true;
    };
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
