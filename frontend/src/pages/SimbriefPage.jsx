import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "sonner";
import { Save, ExternalLink, Link2 } from "lucide-react";
import { makeClient } from "@/lib/api";
import { cache } from "@/lib/utils-app";
import Navbar from "@/components/Navbar";
import { Panel, inputCls, btnPrimary } from "@/components/flight/ui";
import SimbriefPlanner from "@/components/SimbriefPlanner";
import SimLinkPanel from "@/components/SimLinkPanel";

export default function SimbriefPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const [pilotId, setPilotId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/me")
      .then((r) => {
        setPilotId(r.data.simbrief_pilot_id || "");
        setDisplayName(r.data.display_name || user?.fullName || "");
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  const [importing, setImporting] = useState(false);
  const importOfp = async () => {
    setImporting(true);
    try {
      const r = await api.post("/flights/import", {});
      toast.success(`OFP ${r.data.origin} → ${r.data.destination} ready in Flights`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed — check your Pilot ID");
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/me", { simbrief_pilot_id: pilotId.trim() || null, display_name: displayName.trim() || null });
      cache.setProfile(r.data);
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 lg:px-10 py-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-sky-600 dark:text-sky-400">Pilot profile</div>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">SimBrief link</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-8">Your latest OFP is pulled automatically each time you open your flights.</p>

        {loading ? (
          <div className="font-mono text-sm text-slate-500">LOADING…</div>
        ) : (
          <div className="space-y-5">
            <SimbriefPlanner onImport={importOfp} importing={importing} />
            <Panel title="SimBrief integration" icon={Link2}>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">SimBrief Pilot ID</span>
                <input
                  data-testid="simbrief-pilot-id-input"
                  inputMode="numeric"
                  value={pilotId}
                  onChange={(e) => setPilotId(e.target.value)}
                  placeholder="e.g. 123456"
                  className={`${inputCls} mt-1.5 !py-2.5`}
                />
              </label>
              <a
                href="https://dispatch.simbrief.com/account"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                Find it under Account → Pilot ID on SimBrief <ExternalLink className="h-3 w-3" />
              </a>
            </Panel>
            <Panel title="Commander">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Display name (used to sign reports)</span>
                <input
                  data-testid="display-name-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Capt. Jane Doe"
                  className={`${inputCls} mt-1.5 !py-2.5 font-sans`}
                />
              </label>
              <div className="mt-4 font-mono text-xs text-slate-500">{user?.primaryEmailAddress?.emailAddress}</div>
            </Panel>
            <SimLinkPanel api={api} />
            <div className="flex justify-end">
              <button data-testid="save-settings-button" onClick={save} disabled={saving} className={`${btnPrimary} px-5 py-2.5`}>
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
