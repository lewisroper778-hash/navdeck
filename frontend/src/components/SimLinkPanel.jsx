import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cable, Copy, Download, RefreshCw, Unlink } from "lucide-react";
import { Panel, btnPrimary, btnGhost } from "@/components/flight/ui";

const STEPS = [
  "Install FSUIPC7 (the free version is enough) from fsuipc.com if you don't have it.",
  "Download NAVDECK Link below and put NavdeckLink.exe somewhere it can stay, e.g. C:\\NAVDECK.",
  "Open it. If Windows says \"Windows protected your PC\", click More info → Run anyway (the app isn't code-signed yet).",
  "Paste your connection code, then click \"Open with simulator\" so FSUIPC7 starts it with MSFS from now on.",
];

export const ago = (iso) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(iso).toLocaleString();
};

export default function SimLinkPanel({ api }) {
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState(null);
  const load = () => api.get("/bridge/status").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [api]); // eslint-disable-line

  const create = async () => {
    if (status?.paired && !window.confirm("Create a new code? The helper on your sim PC will need the new one.")) return;
    try {
      const r = await api.post("/bridge/link");
      setCode(`${process.env.REACT_APP_BACKEND_URL}#${r.data.token}`);
      load();
    } catch { toast.error("Could not create a connection code"); }
  };
  const unlink = async () => {
    if (!window.confirm("Disconnect the simulator helper?")) return;
    await api.delete("/bridge/link").catch(() => {});
    setCode(null);
    load();
  };
  const copy = () => navigator.clipboard?.writeText(code).then(() => toast.success("Code copied")).catch(() => toast.error("Copy failed, select the code instead"));

  return (
    <Panel title="Simulator link (MSFS 2020 / 2024)" icon={Cable} tone="emerald" testId="sim-link-panel">
      <p className="text-sm text-slate-600 dark:text-slate-300">NAVDECK Link is a small Windows app that reads MSFS through FSUIPC7 and fills in your pushback (gate out), takeoff, landing with touchdown rate, gate in and fuel at the gate on your open flight. Air and block time follow from those.</p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <a data-testid="sim-link-download" href="/downloads/NavdeckLink.exe" download className={btnGhost}><Download className="h-4 w-4" /> Download NAVDECK Link (Windows, 70 MB)</a>
        <button data-testid="sim-link-create" onClick={create} className={btnPrimary}><RefreshCw className="h-4 w-4" /> {status?.paired ? "New connection code" : "Create connection code"}</button>
        {status?.paired && <button data-testid="sim-link-unlink" onClick={unlink} className={btnGhost}><Unlink className="h-4 w-4" /> Disconnect</button>}
      </div>
      {code && (
        <div data-testid="sim-link-code-box" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-500/10">
          <div className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Your connection code (shown once, keep it private)</div>
          <div className="flex gap-2">
            <code data-testid="sim-link-code" className="flex-1 select-all break-all rounded-xl bg-white p-3 font-mono text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100">{code}</code>
            <button data-testid="sim-link-copy" onClick={copy} className={btnGhost} aria-label="Copy code"><Copy className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      <div data-testid="sim-link-status" className="mt-4 rounded-2xl bg-slate-50 p-3 font-mono text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        {!status?.paired ? "Not linked yet." : (
          <>
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${status.online ? "bg-emerald-500" : "bg-slate-400"}`} />
            {status.online ? `Connected · ${status.sim || "sim"} · ${status.aircraft || ""}` : `Helper offline · last seen ${ago(status.last_seen)}`}
            <div className="mt-1 text-slate-500">Sending to: {status.flight || "no open flight"}</div>
          </>
        )}
      </div>
    </Panel>
  );
}
