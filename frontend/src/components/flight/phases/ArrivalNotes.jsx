import { useState } from "react";
import { CloudSun } from "lucide-react";
import { Panel, inputCls, btnGhost } from "../ui";
import { makeClient } from "@/lib/api";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import AiCard from "../AiCard";

export default function ArrivalNotes({ f, saveNotes }) {
  const { getToken } = useAuth();
  const n = f.arrival_notes || {};
  const [loading, setLoading] = useState(false);
  const fetchMetar = async () => {
    setLoading(true);
    try {
      const r = await makeClient(getToken).get(`/metar/${f.destination}`);
      if (!r.data.metar) return toast.info(`No METAR published for ${f.destination}`);
      await saveNotes({ metar: r.data.metar });
    } catch {
      toast.error("Weather service unavailable");
    } finally {
      setLoading(false);
    }
  };
  const field = (k, label, ph, rows = 1) => (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <textarea
        key={`${k}-${n[k] || ""}`}
        data-testid={`arrival-${k}-input`}
        defaultValue={n[k] || ""}
        rows={rows}
        placeholder={ph}
        onBlur={(e) => e.target.value !== (n[k] || "") && saveNotes({ [k]: e.target.value })}
        className={`${inputCls} mt-1 resize-none font-sans`}
      />
    </label>
  );
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel
        title="Arrival weather & runway"
        icon={CloudSun}
        tone="sky"
        testId="arrival-notes-panel"
        right={<button type="button" data-testid="fetch-metar-button" onClick={fetchMetar} disabled={loading} className={btnGhost}>{loading ? "Fetching…" : `Get ${f.destination} METAR`}</button>}
      >
        <div className="space-y-3">
          {field("metar", "Weather (METAR / ATIS)", "EDDB 082020Z 11004KT 9999 OVC017 04/02 Q1025", 3)}
          {field("runway", "Runway in use / exit", "25R, exit B5")}
          {field("notes", "Arrival notes", "STAR, taxi route, gate, remarks…", 2)}
        </div>
      </Panel>
      <AiCard title="Weather decoder" mode="metar" flightId={f.id} saved={f.ai?.metar} body={{ message: n.metar }} tone="sky" cta="Decode weather" testId="ai-metar" />
    </div>
  );
}
