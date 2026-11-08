import { Sparkles, RefreshCw } from "lucide-react";
import { Panel } from "./ui";
import { useAiStream } from "@/lib/ai";

// One-tap AI card (briefing, debrief, METAR decode) that streams the answer in
export default function AiCard({ title, mode, flightId, saved, body, tone = "violet", cta, testId, disabled = false }) {
  const { text, busy, error, run } = useAiStream();
  const shown = text || saved;
  return (
    <Panel
      title={title}
      icon={Sparkles}
      tone={tone}
      testId={testId}
      right={
        <button data-testid={`${testId}-run`} type="button" disabled={busy || disabled} onClick={() => run(`/ai/${flightId}/${mode}`, body)} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 text-sm font-semibold text-white shadow-md disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Thinking…" : shown ? "Regenerate" : cta}
        </button>
      }
    >
      {error && <p data-testid={`${testId}-error`} className="mb-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 px-4 py-2 text-sm text-rose-600">{error}</p>}
      <div data-testid={`${testId}-output`} className="whitespace-pre-wrap rounded-2xl bg-violet-50/60 dark:bg-violet-500/10 p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200 min-h-[64px]">
        {shown || <span className="text-slate-400">Tap “{cta}” and your AI co-pilot will write it from this flight's data.</span>}
      </div>
    </Panel>
  );
}
