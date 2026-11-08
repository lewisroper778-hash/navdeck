import { useState } from "react";
import { getApiToken } from "@/lib/api";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Streams an AI answer over SSE; onDelta receives each text chunk
export async function streamAi(path, body, onDelta) {
  const token = await getApiToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.detail === "string" ? j.detail : "AI request failed");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const data = p.replace(/^data: /, "");
      if (data === "[DONE]") return;
      const j = JSON.parse(data);
      if (j.error) throw new Error(j.error);
      if (j.delta) onDelta(j.delta);
    }
  }
}

export function useAiStream() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (path, body) => {
    setText("");
    setError(null);
    setBusy(true);
    try {
      await streamAi(path, body, (d) => setText((t) => t + d));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { text, busy, error, run, setText };
}
