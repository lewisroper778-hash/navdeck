import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import NavdeckLogo from "@/components/NavdeckLogo";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

async function issueDesktopSession(jwt, onRetry) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 11000);
    try {
      const response = await fetch(`${BACKEND_URL}/api/bridge/link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt === 0) {
          onRetry();
          await new Promise(resolve => setTimeout(resolve, 1200));
          continue;
        }
        if (response.status === 401 || response.status === 403)
          throw new Error("Your Clerk session has expired. Please sign in again.");
        if (RETRYABLE_STATUSES.has(response.status))
          throw new Error("NAVDECK's server or database is temporarily unavailable. Please retry in a moment.");
        throw new Error(`NAVDECK could not connect your desktop session (HTTP ${response.status}).`);
      }
      const result = await response.json();
      if (!/^[A-Za-z0-9_-]{30,80}$/.test(result.token || ""))
        throw new Error("The server returned an invalid desktop session.");
      return result.token;
    } catch (err) {
      if (err.name === "AbortError" || err instanceof TypeError) {
        if (attempt === 0) {
          onRetry();
          await new Promise(resolve => setTimeout(resolve, 1200));
          continue;
        }
        throw new Error(
          "NAVDECK couldn't reach the server. Check your connection and retry. " +
          "If the server is starting, it may take a moment to wake up."
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("NAVDECK couldn't connect. Please retry.");
}

// This page is opened in NAVDECK's dedicated sign-in WebView2 window.
// Clerk authenticates the account; the existing backend verifies the Clerk
// session and issues a revocable desktop-only bridge credential. Passwords,
// Clerk JWTs and bridge credentials are never placed in URLs or localStorage.
export default function DesktopConnectPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  if (isLoaded && !isSignedIn)
    return <Navigate to="/sign-in?desktop=1" replace />;

  async function connectDesktop() {
    if (working) return;
    setError("");
    setRetrying(false);
    setWorking(true);
    try {
      if (!window.chrome?.webview?.postMessage)
        throw new Error("Open this page using Sign in from the NAVDECK Windows app.");
      const jwt = await getToken();
      if (!jwt) throw new Error("Your Clerk session is not ready. Please try again.");
      const token = await issueDesktopSession(jwt, () => setRetrying(true));
      window.chrome.webview.postMessage({
        type: "navdeck:clerk-connected",
        token,
      });
    } catch (err) {
      setError(err.message || "Unable to sign in.");
      setWorking(false);
      setRetrying(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
        <NavdeckLogo size={48} light />
        <h1 className="mt-7 text-2xl font-bold">Connect NAVDECK Desktop</h1>
        <p className="mt-3 text-sm text-slate-300">
          Sign in with your NAVDECK website account. Your flights, SimBrief
          settings and reporting will be available in the Windows app, without
          copying a connection code.
        </p>
        <button type="button" disabled={!isLoaded || working}
          onClick={connectDesktop}
          className="mt-7 w-full rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
          {working ? (retrying ? "Retrying secure connection…" : "Connecting to NAVDECK…") : "Connect this Windows app"}
        </button>
        {retrying && working && <p role="status" className="mt-4 text-sm text-slate-300">The server is taking longer than expected. Trying again automatically…</p>}
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <p className="mt-5 text-xs text-slate-400">
          This signs in the Windows app only. You can sign out from Desktop Settings.
        </p>
      </section>
    </main>
  );
}
