const CACHE = "navdeck-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);

// Network-first for the app shell, fonts and airline logos; API data is cached per pilot in localStorage.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheable =
    (sameOrigin && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/downloads/") && !url.pathname.includes("hot-update") && !url.pathname.startsWith("/ws")) ||
    url.hostname.endsWith("fonts.googleapis.com") ||
    url.hostname.endsWith("fonts.gstatic.com") ||
    url.hostname.endsWith("flightaware.com") ||
    url.hostname.endsWith("avs.io");
  if (!cacheable) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Never store the SPA's index.html under a script/style URL (a missing old chunk falls back to HTML)
        const type = res.headers.get("content-type") || "";
        const wrongType = (req.destination === "script" || req.destination === "style") && type.includes("text/html");
        if ((res.ok || res.type === "opaque") && !wrongType) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/");
        return Response.error();
      })
  );
});
