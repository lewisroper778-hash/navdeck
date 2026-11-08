import { useState } from "react";
import { Users, X, Plus } from "lucide-react";
import { Panel, inputCls, btnPrimary } from "@/components/flight/ui";

export default function FriendsPanel({ friends, pilots, onSave, onPick }) {
  const [value, setValue] = useState("");
  const online = (f) => pilots.find((p) => String(p.cid) === f || p.callsign === f);
  const add = () => {
    const v = value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,12}$/.test(v)) return;
    if (!friends.includes(v)) onSave([...friends, v]);
    setValue("");
  };
  const sorted = [...friends].sort((a, b) => !!online(b) - !!online(a));

  return (
    <Panel title="Friends" icon={Users} tone="sky" testId="vatsim-friends-panel">
      <div className="flex gap-2">
        <input data-testid="friend-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Callsign or CID" className={`${inputCls} uppercase`} />
        <button data-testid="friend-add" onClick={add} className={btnPrimary} aria-label="Add friend"><Plus className="h-4 w-4" /> Add</button>
      </div>
      {friends.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Add a callsign or CID and you'll get a note here when they connect.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sorted.map((f) => {
            const p = online(f);
            return (
              <li key={f} data-testid={`friend-row-${f}`} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2 pl-4 dark:bg-slate-800/60">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                <button data-testid={`friend-focus-${f}`} disabled={!p} onClick={() => onPick(p)}
                  className="min-h-[44px] flex-1 text-left font-mono text-sm disabled:cursor-default">
                  <b className="text-slate-900 dark:text-white">{f}</b>
                  <span data-testid={`friend-status-${f}`} className="ml-2 text-xs text-slate-500">
                    {p ? `Online as ${p.callsign} · ${p.dep || "?"}→${p.arr || "?"}` : "Offline"}
                  </span>
                </button>
                <button data-testid={`friend-remove-${f}`} onClick={() => onSave(friends.filter((x) => x !== f))} aria-label={`Remove ${f}`}
                  className="grid h-11 w-11 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
