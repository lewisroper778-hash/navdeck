import { Component } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

let reports = 0;
export function reportError(message, stack) {
  if (++reports > 5) return;
  try {
    fetch(`${BACKEND_URL}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message: String(message).slice(0, 2000), stack: stack ? String(stack).slice(0, 6000) : null, url: window.location.href.slice(0, 500), ua: navigator.userAgent.slice(0, 400) }),
    }).catch(() => {});
  } catch {}
}

window.addEventListener("error", (e) => reportError(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => reportError(`Unhandled: ${e.reason?.message || e.reason}`, e.reason?.stack));

// Shows a recovery screen instead of a blank page if anything crashes while rendering
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error.message, `${error.stack}\n${info.componentStack}`);
    // After a new deploy an open tab may ask for page files that no longer exist; reload once to get the new ones
    if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(`${error.name} ${error.message}`) && !sessionStorage.getItem("navdeck-chunk-reload")) {
      sessionStorage.setItem("navdeck-chunk-reload", "1");
      window.location.reload();
    }
  }

  reset = async () => {
    localStorage.clear();
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div data-testid="app-error-screen" className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center">
          <h1 className="font-heading text-3xl font-extrabold">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/70">NAVDECK hit an error and has reported it. Reload to try again.</p>
          <p className="mt-3 break-words font-mono text-xs text-white/40">{this.state.error.message}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button data-testid="app-error-reload" onClick={() => window.location.reload()} className="min-h-[44px] rounded-2xl bg-white px-5 font-semibold text-slate-900">Reload</button>
            <button data-testid="app-error-reset" onClick={this.reset} className="min-h-[44px] rounded-2xl bg-white/15 px-5 font-semibold">Clear saved data</button>
          </div>
        </div>
      </div>
    );
  }
}
