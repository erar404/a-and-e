/* Usap Tayo — service worker: only handles push notifications + their clicks */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Usap Tayo", body: event.data ? event.data.text() : "" };
  }

  const HEART_ICON =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23d4a0a4' d='M12 21s-7.5-4.7-10-9.3C.5 8.6 2.3 5 5.7 5c2 0 3.6 1.2 4.3 2.4h4c.7-1.2 2.3-2.4 4.3-2.4 3.4 0 5.2 3.6 3.7 6.7C19.5 16.3 12 21 12 21z'/%3E%3C/svg%3E";

  const title = data.title || "Usap Tayo";
  const options = {
    body: data.body || "",
    icon: HEART_ICON,
    badge: HEART_ICON,
    tag: "usap-tayo-message",
    renotify: true,
    data: { url: data.url || "/chat.html" },
  };

  event.waitUntil(
    (async () => {
      // she's already looking at the chat — the realtime update on screen is enough
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (clientList.some((c) => c.focused && c.url.includes("chat.html"))) return;
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("chat.html") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
