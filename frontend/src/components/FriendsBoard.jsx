import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, ArrowRight } from "lucide-react";
import { LogoPill } from "@/components/AirlineLogo";

const zulu = (iso) => (iso ? `${iso.slice(11, 16)}z` : "—");

function FriendCard({ p, onOpen }) {
  return (
    <button data-testid={`friends-board-card-${p.callsign}`} onClick={onOpen}
      className="flex min-h-[44px] flex-col gap-3 rounded-3xl bg-white p-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-heading text-xl font-extrabold text-slate-900 dark:text-white">{p.callsign}</div>
          <div className="font-mono text-xs text-slate-500">{p.name} · {p.aircraft || "?"}</div>
        </div>
        <LogoPill flight={{ callsign: p.callsign }} size="sm" />
      </div>
      <div className="flex items-center gap-3 font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
        <span>{p.dep || "----"}</span>
        <div className="relative h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800">
          <div data-testid={`friends-board-progress-${p.callsign}`} className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-sky-500" style={{ width: `${p.progress ?? 0}%` }} />
        </div>
        <span>{p.arr || "----"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div><div className="text-slate-500">ETA</div><b data-testid={`friends-board-eta-${p.callsign}`} className="text-base text-slate-900 dark:text-white">{p.on_ground ? "On ground" : zulu(p.eta)}</b></div>
        <div><div className="text-slate-500">To go</div><b className="text-base text-slate-900 dark:text-white">{p.remaining_nm != null ? `${p.remaining_nm} nm` : "—"}</b></div>
        <div><div className="text-slate-500">Level</div><b className="text-base text-slate-900 dark:text-white">FL{String(Math.round(p.alt / 100)).padStart(3, "0")}</b></div>
      </div>
    </button>
  );
}

export default function FriendsBoard({ api }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => {
      api.get("/vatsim/friends").then((r) => setData(r.data)).catch(() => {});
      api.get("/vatsim/landings").then((r) => {
        if (!r.data.length) return;
        r.data.forEach((l) => toast.success(`${l.callsign} landed at ${l.arr || "destination"}`, {
          description: `${l.dep || "?"} → ${l.arr || "?"} · touched down about ${zulu(l.landed_at)}`, duration: 8000, id: l.id,
        }));
        api.post("/vatsim/landings/seen", { ids: r.data.map((l) => l.id) }).catch(() => {});
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [api]);

  const online = data?.online || [];
  return (
    <section data-testid="friends-board">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900 dark:text-white">
          <Users className="h-5 w-5 text-emerald-500" /> Friends online
          {data && <span data-testid="friends-board-count" className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{online.length}/{data.friends}</span>}
        </h2>
        <button data-testid="friends-board-manage" onClick={() => navigate("/vatsim")} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-sky-600 dark:text-sky-400">
          Manage <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {online.length === 0 ? (
        <p data-testid="friends-board-empty" className="rounded-3xl bg-white p-6 text-sm text-slate-500 dark:bg-slate-900">
          {data?.friends ? `None of your ${data.friends} friends are on VATSIM right now.` : "You haven't added any friends yet. Add their callsign or CID on the VATSIM page."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {online.map((p) => <FriendCard key={p.cid} p={p} onOpen={() => navigate(`/vatsim?focus=${p.cid}`)} />)}
        </div>
      )}
    </section>
  );
}
