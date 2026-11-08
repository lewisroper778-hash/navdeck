import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, BookOpen } from "lucide-react";
import { makeClient } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Panel } from "@/components/flight/ui";
import AirlineLogo from "@/components/AirlineLogo";

const hm = (m) => `${Math.floor((m || 0) / 60)}:${String((m || 0) % 60).padStart(2, "0")}`;

export default function LogbookPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get("/logbook").then((r) => setRows(r.data)).catch(() => toast.error("Could not load logbook"));
  }, [api]);

  const openPdf = async (docId) => {
    const w = window.open("", "_blank");
    try {
      const r = await api.get(`/documents/${docId}/file`, { responseType: "blob" });
      w.location.href = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
    } catch {
      w?.close();
      toast.error("Could not open the PDF");
    }
  };

  const list = rows || [];
  const rates = list.map((r) => Math.abs(Number(r.landing_rate))).filter((n) => !isNaN(n) && n > 0);
  const totals = [
    ["Total hours", hm(list.reduce((s, r) => s + r.block_minutes, 0)), "logbook-total-hours"],
    ["Air time", hm(list.reduce((s, r) => s + r.air_minutes, 0)), "logbook-air-time"],
    ["Landings", list.length, "logbook-landings"],
    ["Avg landing rate", rates.length ? `-${Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)} fpm` : "—", "logbook-avg-rate"],
  ];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 md:px-6 lg:px-8 py-8">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-indigo-600 dark:text-indigo-400">Records</div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Pilot logbook</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {totals.map(([l, v, id]) => (
            <div key={l} className="rounded-[28px] bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="text-sm text-slate-500">{l}</div>
              <div data-testid={id} className="font-mono text-3xl font-bold text-slate-900 dark:text-white">{v}</div>
            </div>
          ))}
        </div>
        <Panel title="Closed flights & saved reports" icon={BookOpen} tone="sky" testId="logbook-table-panel" className="overflow-hidden">
          {rows && rows.length === 0 ? (
            <p data-testid="logbook-empty" className="text-sm text-slate-500">Close a flight to add it to your logbook. Its signed report PDF is saved here automatically.</p>
          ) : (
            <div className="-mx-6 -mb-6 overflow-x-auto">
              <table data-testid="logbook-table" className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>{["Date", "Flight", "Route", "Out / In", "Block", "Air", "Landing", "Report"].map((h) => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} data-testid={`logbook-row-${r.id}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.closed_at?.slice(0, 10)}</td>
                      <td className="px-4 py-3"><button onClick={() => navigate(`/flights/${r.id}/close`)} className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><span className="rounded-lg bg-white px-1.5 py-1 ring-1 ring-slate-200"><AirlineLogo flight={r} size="sm" /></span>{r.callsign}</button></td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">{r.origin} → {r.destination}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{r.off}–{r.on}</td>
                      <td className="px-4 py-3 font-mono">{hm(r.block_minutes)}</td>
                      <td className="px-4 py-3 font-mono">{hm(r.air_minutes)}</td>
                      <td className="px-4 py-3 font-mono">{r.landing_rate ? `-${Math.abs(r.landing_rate)} fpm` : "—"}</td>
                      <td className="px-4 py-3">
                        {r.document_id ? (
                          <button data-testid={`logbook-pdf-${r.id}`} onClick={() => openPdf(r.document_id)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 text-xs font-semibold text-rose-600 dark:text-rose-300"><FileText className="h-4 w-4" /> PDF</button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}
