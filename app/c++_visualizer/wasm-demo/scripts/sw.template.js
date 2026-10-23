const PREFIX = "dentro-il-codice-" + self.registration.scope + "-";
const CACHE = PREFIX + "__VERSION__";
const CORE = __CORE__;
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        CORE.map((file) =>
          cache.add(
            new Request(new URL(file, self.registration.scope), {
              cache: "reload",
            }),
          ),
        ),
      ),
    ),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data === "activate") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === "navigate") {
        try {
          return await fetch(event.request);
        } catch {
          return await cache.match(
            new URL("index.html", self.registration.scope),
          );
        }
      }
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request),
        url = new URL(event.request.url);
      if (
        response.ok &&
        url.pathname.startsWith(
          new URL("toolchain/", self.registration.scope).pathname,
        )
      )
        await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
