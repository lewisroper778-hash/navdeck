import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { MessageCircle, Send, X } from "lucide-react";
import { makeClient } from "@/lib/api";
import { streamAi } from "@/lib/ai";

export default function CopilotChat({ flightId }) {
  const { getToken } = useAuth();
  const api = useMemo(() => makeClient(getToken), [getToken]);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    if (open) api.get(`/ai/${flightId}/chat`).then((r) => setMsgs(r.data)).catch(() => {});
  }, [open, flightId, api]);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "pilot", text }, { role: "copilot", text: "" }]);
    try {
      await streamAi(`/ai/${flightId}/chat`, { message: text }, (d) =>
        setMsgs((m) => [...m.slice(0, -1), { role: "copilot", text: m[m.length - 1].text + d }])
      );
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "copilot", text: `⚠ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print:hidden">
      <button data-testid="copilot-open-button" onClick={() => setOpen((o) => !o)} className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 via-indigo-500 to-fuchsia-500 text-white shadow-xl shadow-indigo-500/30 active:scale-95 transition-transform" aria-label="AI co-pilot">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <div data-testid="copilot-panel" className="fixed bottom-28 right-6 z-50 flex h-[520px] max-h-[70vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-rise">
          <div className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-4 text-white">
            <div className="font-heading text-lg font-bold">AI Co-pilot</div>
            <div className="text-xs text-white/80">Ask anything about this flight</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && <p className="text-sm text-slate-400">Try “What's my fuel margin at destination?” or “Brief me on the arrival.”</p>}
            {msgs.map((m, i) => (
              <div key={i} data-testid={`copilot-msg-${i}`} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "pilot" ? "ml-auto bg-indigo-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100"}`}>
                {m.text || "…"}
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 p-3">
            <input data-testid="copilot-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message your co-pilot…" className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15" />
            <button data-testid="copilot-send-button" onClick={send} disabled={busy || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
