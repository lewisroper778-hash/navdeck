import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

// Finger / Apple Pencil signature pad; calls onChange with a PNG data URL (or null when cleared)
export default function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e1b4b";
  }, []);

  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = ref.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext("2d");
    ctx.lineWidth = e.pointerType === "pen" ? 1.2 + (e.pressure || 0.5) * 2.5 : 2.6;
    ctx.lineTo(...point(e));
    ctx.stroke();
    setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={ref}
        data-testid="signature-pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="h-36 w-full touch-none rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white"
      />
      {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sign here with your finger or Apple Pencil</span>}
      <button type="button" data-testid="signature-clear" onClick={clear} className="absolute right-2 top-2 inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-600">
        <Eraser className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}
