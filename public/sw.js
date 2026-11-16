const CACHE_NAME = "pomo-shell-v3-2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/pomo-192.png",
  "/icons/pomo-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      // On a first visit the worker installs after the JS and CSS have already loaded.
      const html = await (await cache.match("/index.html")).text();
      const assets = Array.from(
        html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
        (match) => match[1],
      );
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pomo-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const asset = url.pathname.startsWith("/assets/");
  if (!asset && !APP_SHELL.includes(url.pathname) && request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Content-hashed, same-origin build assets are identical across Origin headers.
      const cached = await cache.match(request, { ignoreVary: asset });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && asset) await cache.put(request, response.clone());
        return response;
      } catch {
        const shell = request.mode === "navigate" && (await cache.match("/index.html"));
        return shell || Response.error();
      }
    })(),
  );
});
