import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { toast } from "sonner";
import { Save, ExternalLink } from "lucide-react";
import { makeClient } from "@/lib/api";
import { SETTINGS } from "@/constants/testIds";
import Navbar from "@/components/Navbar";

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [pilotId, setPilotId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const api = makeClient(getToken);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/me");
        setPilotId(r.data.simbrief_pilot_id || "");
        setDisplayName(r.data.display_name || user?.fullName || "");
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/me", {
        simbrief_pilot_id: pilotId.trim() || null,
        display_name: displayName.trim() || null,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-8 py-10">
        <div className="border-b border-slate-200 pb-6 mb-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Pilot Profile
          </div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-slate-900 mt-2">
            SimBrief & Account
          </h1>
          <p className="text-slate-600 mt-2">
            Link your SimBrief Pilot ID to import OFPs with one click.
          </p>
        </div>

        {loading ? (
          <div className="font-mono text-sm text-slate-500">LOADING…</div>
        ) : (
          <div className="border border-slate-200 bg-white">
            <div className="p-6 border-b border-slate-200">
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-900 mb-6">
                SimBrief Integration
              </h2>
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">
                  SimBrief Pilot ID
                </span>
                <input
                  data-testid={SETTINGS.pilotIdInput}
                  type="text"
                  inputMode="numeric"
                  value={pilotId}
                  onChange={(e) => setPilotId(e.target.value)}
                  placeholder="e.g. 123456"
                  className="mt-2 block w-full rounded-sm border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </label>
              <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
                Find your Pilot ID at your SimBrief account page →
                <a
                  href="https://dispatch.simbrief.com/account"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900"
                >
                  dispatch.simbrief.com/account
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="p-6 border-b border-slate-200">
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-900 mb-6">
                Display
              </h2>
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">
                  Display name
                </span>
                <input
                  data-testid={SETTINGS.displayNameInput}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Captain Name"
                  className="mt-2 block w-full rounded-sm border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </label>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Email</div>
                  <div className="text-sm text-slate-800 mt-1 font-mono">
                    {user?.primaryEmailAddress?.emailAddress}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Account</div>
                  <div className="text-sm text-slate-800 mt-1 font-mono">
                    {user?.id?.slice(0, 16)}…
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 flex items-center justify-end gap-3 bg-slate-50">
              <button
                data-testid={SETTINGS.saveButton}
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-sm bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
