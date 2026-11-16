import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import NavdeckLogo from "@/components/NavdeckLogo";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// This page is opened in NAVDECK's dedicated sign-in WebView2 window.
// Clerk authenticates the account; the existing backend verifies the Clerk
// session and issues a revocable desktop-only bridge credential. Passwords,
// Clerk JWTs and bridge credentials are never placed in URLs or localStorage.
export default function DesktopConnectPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  if (isLoaded && !isSignedIn)
    return <Navigate to="/sign-in?desktop=1" replace />;

  async function connectDesktop() {
    if (working) return;
    setError("");
    setWorking(true);
    try {
      if (!window.chrome?.webview?.postMessage)
        throw new Error("Open this page using Sign in from the NAVDECK Windows app.");
      const jwt = await getToken();
      if (!jwt) throw new Error("Your Clerk session is not ready. Please try again.");
      const response = await fetch(`${BACKEND_URL}/api/bridge/link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!response.ok)
        throw new Error(response.status === 401
          ? "Your Clerk session has expired. Please sign in again."
          : "NAVDECK could not connect this desktop session.");
      const result = await response.json();
      if (!/^[A-Za-z0-9_-]{30,80}$/.test(result.token || ""))
        throw new Error("The server returned an invalid desktop session.");
      window.chrome.webview.postMessage({
        type: "navdeck:clerk-connected",
        token: result.token,
      });
    } catch (err) {
      setError(err.message || "Unable to sign in.");
      setWorking(false);
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
          {working ? "Connecting to NAVDECK…" : "Connect this Windows app"}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <p className="mt-5 text-xs text-slate-400">
          This signs in the Windows app only. You can sign out from Desktop Settings.
        </p>
      </section>
    </main>
  );
}
