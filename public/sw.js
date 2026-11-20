/* Service worker de Alerta 116: notificaciones push y apertura de la emergencia al tocarlas. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Alerta 116", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Nueva emergencia";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: "/pwa-icon/192",
    badge: "/pwa-icon/badge",
    data: { url: data.url || "/" },
    vibrate: data.urgente ? [300, 120, 300, 120, 600] : [200, 100, 200],
    requireInteraction: !!data.urgente,
    timestamp: Date.now(),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      for (const c of clientes) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* Si el navegador renueva la suscripción, la reenviamos con las preferencias guardadas por la página. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const r = await fetch("/api/push");
      const { publicKey } = await r.json();
      if (!publicKey) return;
      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), anterior: event.oldSubscription?.endpoint || null }),
      });
    })(),
  );
});
