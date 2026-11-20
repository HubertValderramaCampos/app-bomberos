"use client";

import type { PrefsAlertas } from "@/lib/types";

export function soportaPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function esIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function esStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("No se pudo registrar el service worker", err);
    return null;
  }
}

function base64UrlABytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!soportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function activarPush(prefs: PrefsAlertas): Promise<{ ok: boolean; error?: string }> {
  if (!soportaPush()) return { ok: false, error: "Este navegador no soporta notificaciones push." };
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, error: "Permiso de notificaciones denegado. Actívalo en los ajustes del navegador." };

  const reg = (await registrarSW()) ?? (await navigator.serviceWorker.ready);
  const { publicKey } = (await fetch("/api/push").then((r) => r.json())) as { publicKey: string | null };
  if (!publicKey) return { ok: false, error: "El servidor no tiene configuradas las claves VAPID." };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(publicKey) });
  }
  return sincronizarPush(prefs, sub);
}

export async function sincronizarPush(prefs: PrefsAlertas, sub?: PushSubscription | null) {
  const s = sub ?? (await suscripcionActual());
  if (!s) return { ok: false, error: "Sin suscripción" };
  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: s.toJSON(), prefs }),
  });
  return r.ok ? { ok: true } : { ok: false, error: "No se pudo guardar la suscripción en el servidor." };
}

export async function desactivarPush() {
  const s = await suscripcionActual();
  if (!s) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: s.endpoint }),
  }).catch(() => {});
  await s.unsubscribe();
}

export async function probarPush() {
  const s = await suscripcionActual();
  if (!s) return false;
  const r = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: s.toJSON(), accion: "prueba" }),
  });
  return r.ok && ((await r.json()) as { ok: boolean }).ok;
}
