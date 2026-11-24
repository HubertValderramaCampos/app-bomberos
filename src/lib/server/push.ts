import crypto from "node:crypto";
import { sendNotification, setVapidDetails } from "web-push";
import type { Emergencia, PrefsAlertas, SelectivaInfo } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { distanciaKm, formatoDistancia } from "@/lib/geo";
import { guardar, leer } from "./store";

export interface Suscripcion {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  prefs: PrefsAlertas;
  creado: string;
  actualizado: string;
  /** Partes ya notificados a esta suscripción (para no repetir) */
  notificados: string[];
}

type Mapa = Record<string, Suscripcion>;

let vapidListo: boolean | null = null;

export function vapidPublica(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configurarVapid(): boolean {
  if (vapidListo !== null) return vapidListo;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas: push deshabilitado");
    return (vapidListo = false);
  }
  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:alertas@example.com", pub, priv);
  return (vapidListo = true);
}

const idDe = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 24);

export function guardarSuscripcion(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, prefs: PrefsAlertas) {
  const mapa = leer<Mapa>("suscripciones", {});
  const id = idDe(sub.endpoint);
  const ahora = new Date().toISOString();
  mapa[id] = {
    id,
    endpoint: sub.endpoint,
    keys: sub.keys,
    prefs,
    creado: mapa[id]?.creado ?? ahora,
    actualizado: ahora,
    notificados: mapa[id]?.notificados ?? [],
  };
  guardar("suscripciones", mapa);
  return id;
}

export function prefsDe(endpoint: string): PrefsAlertas | null {
  return leer<Mapa>("suscripciones", {})[idDe(endpoint)]?.prefs ?? null;
}

export function eliminarSuscripcion(endpoint: string) {
  const mapa = leer<Mapa>("suscripciones", {});
  delete mapa[idDe(endpoint)];
  guardar("suscripciones", mapa);
}

export function totalSuscripciones() {
  return Object.keys(leer<Mapa>("suscripciones", {})).length;
}

export interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
  categoria?: string;
  urgente?: boolean;
  /** URL de navegación (Google Maps) para el botón "Ir" de la notificación */
  ir?: string | null;
  /** Mostrar botón "Radio" */
  radio?: boolean;
}

async function enviar(sub: Suscripcion, payload: Payload): Promise<boolean> {
  if (!configurarVapid()) return false;
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 15 * 60, urgency: payload.urgente ? "high" : "normal", topic: payload.tag.slice(0, 32) },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Suscripción caducada o revocada por el usuario
      eliminarSuscripcion(sub.endpoint);
    } else {
      console.error("[push] error enviando:", status, (err as Error).message);
    }
    return false;
  }
}

export async function enviarPrueba(endpoint: string) {
  const sub = leer<Mapa>("suscripciones", {})[idDe(endpoint)];
  if (!sub) return false;
  return enviar(sub, {
    // Ejemplo con el formato real: ícono, distancia y tiempo, dirección, unidades y botones
    title: "🔥 INCENDIO · 2.3 km ~8 min (PRUEBA)",
    body: "ESTRUCTURAS / VIVIENDA\nAv. Ejemplo 123 · SURQUILLO\nM11-1 · AMB-11-3 · RES-2",
    url: "/",
    tag: "prueba",
    ir: "https://www.google.com/maps/dir/?api=1&destination=-12.1125,-77.0125&travelmode=driving",
    radio: true,
  });
}

type Motivo =
  | { tipo: "compania"; compania: number }
  | { tipo: "cercana"; km: number }
  | { tipo: "escala"; km: number | null; umbral: number };
const ICONO: Record<string, string> = { incendio: "🔥", medica: "🚑", rescate: "🆘", vehicular: "🚗", matpel: "☣️", servicio: "🛠️", otro: "📍" };
/** Umbrales de unidades a partir de los cuales una emergencia "se amplía" (se avisa una vez por umbral). */
const UMBRALES_AMPLIA = [4, 7, 10];
/** Claves de incendio con apoyo creciente (20-15 … 20-18) o catástrofe (20-19) también cuentan como ampliación. */
const CLAVE_MAYOR = /\b20[-\s.]?(16|17|18|19)\b/;

/** Tiempo estimado manejando en Lima (calles, no línea recta): ~22 km/h + 2 min de salida. */
const etaMin = (km: number) => Math.max(1, Math.round(2 + ((km * 1.35) / 22) * 60));

const urlIr = (e: Emergencia) =>
  e.lat != null && e.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=driving`
    : e.direccion
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.direccion}, ${e.distrito}, Perú`)}`
      : null;

function kmDesde(sub: Suscripcion, e: Emergencia) {
  const p = sub.prefs;
  if (p.lat == null || p.lng == null || e.lat == null || e.lng == null) return null;
  return distanciaKm({ lat: p.lat, lng: p.lng }, { lat: e.lat, lng: e.lng });
}

function esDeMiCompania(sub: Suscripcion, maquinas: string[], companias: number[]) {
  const c = sub.prefs.compania;
  if (!c) return false;
  return companias.includes(c) || maquinas.some((m) => Number((m.match(/(\d+)/) ?? [])[1]) === c);
}

/** Qué avisar a esta suscripción y con qué clave de "ya avisado" (para no repetir). */
function motivoPara(sub: Suscripcion, e: Emergencia, maquinasNuevas?: string[]): { motivo: Motivo; clave: string } | null {
  const p = sub.prefs;
  if (esDeMiCompania(sub, maquinasNuevas ?? e.maquinas, maquinasNuevas ? [] : e.companias)) {
    return { motivo: { tipo: "compania", compania: p.compania! }, clave: e.parte };
  }
  const km = kmDesde(sub, e);
  const enZona = km != null && km <= p.radioKm && p.categorias.includes(e.categoria);
  if (maquinasNuevas) {
    // Se amplía: más unidades (cruza un umbral) o clave de incendio mayor, en tu zona o de tu tipo de interés
    if (!e.activa || !(enZona || (km != null && km <= p.radioKm * 2 && e.categoria === "incendio"))) return null;
    const umbral = [...UMBRALES_AMPLIA].reverse().find((u) => e.maquinas.length >= u && e.maquinas.length - maquinasNuevas.length < u);
    const porClave = CLAVE_MAYOR.test(e.radio?.texto ?? "") ? 99 : null;
    const u = umbral ?? porClave;
    return u ? { motivo: { tipo: "escala", km, umbral: u }, clave: `${e.parte}#amplia${u}` } : null;
  }
  return enZona ? { motivo: { tipo: "cercana", km: km! }, clave: e.parte } : null;
}

/**
 * Notificación de emergencia nueva, de nuevas unidades de tu compañía o de ampliación.
 * Formato para leer de un vistazo: ícono + tipo + distancia/tiempo, dirección y unidades, con botones Ir y Radio.
 */
export async function notificarEmergencia(e: Emergencia, maquinasNuevas?: string[]) {
  if (!configurarVapid()) return;
  const mapa = leer<Mapa>("suscripciones", {});
  const destinos: { sub: Suscripcion; motivo: Motivo; clave: string }[] = [];
  for (const sub of Object.values(mapa)) {
    const m = motivoPara(sub, e, maquinasNuevas);
    if (m && !sub.notificados.includes(m.clave)) destinos.push({ sub, ...m });
  }
  if (destinos.length === 0) return;

  const icono = ICONO[e.categoria] ?? "📍";
  const tipo = e.subtipo ? `${e.tipoPrincipal} · ${e.subtipo}` : e.tipoPrincipal;
  const lugar = [e.direccion, e.distrito].filter(Boolean).join(" · ") || "Dirección por confirmar";
  const unidades = e.maquinas.length ? e.maquinas.join(" · ") : "";
  const porRadio = e.fuente === "radio" ? "🔊 Por radio, aún no está en el SGO" : "";

  await Promise.all(
    destinos.map(async ({ sub, motivo, clave }) => {
      const km = kmDesde(sub, e);
      const cerca = km != null ? ` · ${formatoDistancia(km)} ~${etaMin(km)} min` : "";
      let title: string;
      if (motivo.tipo === "compania") title = `🚨 B-${motivo.compania} DESPACHADA · ${icono} ${e.tipoPrincipal}`;
      else if (motivo.tipo === "escala")
        title = `⚠️ SE AMPLÍA · ${icono} ${e.tipoPrincipal} · ${e.maquinas.length} unidades${maquinasNuevas?.length ? ` (+${maquinasNuevas.length})` : ""}`;
      else title = `${icono} ${e.tipoPrincipal}${cerca}`;
      const body = [motivo.tipo === "cercana" ? (e.subtipo || "") : tipo + cerca, lugar, unidades, porRadio].filter(Boolean).join("\n");
      const ok = await enviar(sub, {
        title,
        body,
        url: `/emergencia/${e.parte}`,
        // La provisional por radio y la del SGO comparten etiqueta: la notificación se ACTUALIZA, no se duplica
        tag: motivo.tipo === "escala" ? `amplia-${e.parte}` : `parte-${e.radio?.provisional ?? e.parte}`,
        categoria: e.categoria,
        urgente: motivo.tipo !== "cercana" || e.categoria === "incendio" || e.categoria === "matpel",
        ir: urlIr(e),
        radio: true,
      });
      if (ok) {
        const actual = leer<Mapa>("suscripciones", {});
        const s = actual[sub.id];
        if (s) {
          s.notificados = [...s.notificados, clave].slice(-300);
          guardar("suscripciones", actual);
        }
      }
    }),
  );
  console.log(`[push] parte ${e.parte}${maquinasNuevas ? " (actualización)" : ""}: ${destinos.length} notificación(es)`);
}

/** La Central llamó por selectiva a una compañía: aviso a quienes la tienen como "mi compañía". */
export async function notificarSelectiva(sel: SelectivaInfo) {
  if (!configurarVapid() || !sel.cia) return;
  const hora = new Date(sel.epoch * 1000).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
  const destinos = Object.values(leer<Mapa>("suscripciones", {})).filter((s) => s.prefs.compania && `B-${s.prefs.compania}` === sel.cia);
  if (!destinos.length) return;
  const probable = sel.origen === "inferida" ? ` (probable, ${Math.round((sel.confianza ?? 0) * 100)} %)` : "";
  await Promise.all(
    destinos.map((sub) =>
      enviar(sub, {
        title: `🚨 LA CENTRAL LLAMA A ${sel.cia}${probable}`,
        body: `Selectiva ${hora} · Canal 2\nEscucha el despacho ahora`,
        url: sel.parte ? `/emergencia/${sel.parte}` : "/radio",
        tag: `sel-${sel.epoch}`,
        urgente: true,
        radio: true,
      }),
    ),
  );
  console.log(`[push] selectiva ${sel.cia}: ${destinos.length} notificación(es)`);
}

/** Cuando un despacho por radio se confirma en el SGO, quien ya fue avisado no se vuelve a avisar. */
export function transferirNotificados(desde: string, hacia: string) {
  const mapa = leer<Mapa>("suscripciones", {});
  let cambio = false;
  for (const sub of Object.values(mapa)) {
    if (sub.notificados.includes(desde) && !sub.notificados.includes(hacia)) {
      sub.notificados = [...sub.notificados, hacia].slice(-300);
      cambio = true;
    }
  }
  if (cambio) guardar("suscripciones", mapa);
}
