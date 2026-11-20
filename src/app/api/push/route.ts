import type { Categoria, PrefsAlertas } from "@/lib/types";
import { PREFS_DEFAULT } from "@/lib/types";
import { ORDEN_CATEGORIAS } from "@/lib/categorias";
import { eliminarSuscripcion, enviarPrueba, guardarSuscripcion, prefsDe, vapidPublica } from "@/lib/server/push";
import { ipDe, permitir } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** Clave pública VAPID para que el navegador cree la suscripción. */
export async function GET() {
  return Response.json({ publicKey: vapidPublica() });
}

function validarPrefs(p: Partial<PrefsAlertas> | undefined): PrefsAlertas {
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
  return {
    ...PREFS_DEFAULT,
    lat: num(p?.lat, -19, 1),
    lng: num(p?.lng, -82, -68),
    seguirUbicacion: !!p?.seguirUbicacion,
    radioKm: num(p?.radioKm, 0.5, 50) ?? PREFS_DEFAULT.radioKm,
    categorias: Array.isArray(p?.categorias)
      ? (p.categorias.filter((c) => ORDEN_CATEGORIAS.includes(c as Categoria)) as Categoria[])
      : PREFS_DEFAULT.categorias,
    compania: num(p?.compania, 1, 9999),
    sonido: p?.sonido !== false,
    vibracion: p?.vibracion !== false,
  };
}

/** Crea o actualiza la suscripción. body: { subscription, prefs, accion?: "prueba" } */
export async function POST(req: Request) {
  if (!permitir(`push:${ipDe(req)}`, 30, 10 * 60_000)) {
    return Response.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    prefs?: Partial<PrefsAlertas>;
    accion?: string;
    /** Endpoint anterior cuando el navegador renovó la suscripción (pushsubscriptionchange) */
    anterior?: string | null;
  } | null;
  const s = body?.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) {
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  if (body?.accion === "prueba") {
    const ok = await enviarPrueba(s.endpoint);
    return Response.json({ ok });
  }
  let prefs = body?.prefs;
  if (!prefs && body?.anterior) {
    prefs = prefsDe(body.anterior) ?? undefined;
    eliminarSuscripcion(body.anterior);
  }
  if (!prefs) prefs = prefsDe(s.endpoint) ?? undefined;
  const id = guardarSuscripcion({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, validarPrefs(prefs));
  return Response.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return Response.json({ error: "Falta endpoint" }, { status: 400 });
  eliminarSuscripcion(body.endpoint);
  return Response.json({ ok: true });
}
