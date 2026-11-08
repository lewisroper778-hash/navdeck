import { Popup } from "react-leaflet";
import { Crosshair, Star } from "lucide-react";
import { LogoPill } from "@/components/AirlineLogo";

const Cell = ({ label, value, testId }) => (
  <div className="rounded-xl bg-slate-100 px-2.5 py-1.5">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div data-testid={testId} className="font-bold text-slate-900">{value}</div>
  </div>
);

export default function TrafficPopup({ pilot, onClose, following, onFollow, isFriend, onFriend }) {
  const action = "inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors";
  return (
    <Popup position={[pilot.lat, pilot.lon]} eventHandlers={{ remove: onClose }} minWidth={270} offset={[0, -6]} autoPan={!following}>
      <div data-testid="traffic-popup" className="space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between gap-3">
          <LogoPill flight={{ callsign: pilot.callsign }} size="sm" />
          <div className="text-right">
            <div data-testid="traffic-popup-callsign" className="font-heading text-lg font-extrabold text-slate-900">{pilot.callsign}</div>
            <div className="text-slate-500">{pilot.name || "Unknown pilot"}</div>
          </div>
        </div>
        <div data-testid="traffic-popup-route" className="rounded-xl bg-slate-900 px-3 py-2 text-center text-sm font-bold tracking-wider text-white">
          {pilot.dep || "----"} → {pilot.arr || "----"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Aircraft" value={pilot.aircraft || "—"} testId="traffic-popup-aircraft" />
          <Cell label="Altitude" value={`${Number(pilot.alt).toLocaleString()} ft`} testId="traffic-popup-alt" />
          <Cell label="Ground speed" value={`${pilot.gs} kt`} testId="traffic-popup-gs" />
          <Cell label="Heading" value={`${String(pilot.hdg).padStart(3, "0")}°`} testId="traffic-popup-hdg" />
        </div>
        <div className="flex gap-2">
          <button data-testid="traffic-popup-follow" onClick={onFollow} aria-pressed={following}
            className={`${action} ${following ? "bg-amber-500 text-white" : "bg-slate-900 text-white hover:bg-slate-700"}`}>
            <Crosshair className="h-4 w-4" /> {following ? "Following" : "Follow"}
          </button>
          <button data-testid="traffic-popup-friend" onClick={onFriend} aria-pressed={isFriend}
            className={`${action} ${isFriend ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            <Star className="h-4 w-4" /> {isFriend ? "Friend" : "Add friend"}
          </button>
        </div>
        <div className="text-[10px] text-slate-400">CID {pilot.cid}</div>
      </div>
    </Popup>
  );
}
