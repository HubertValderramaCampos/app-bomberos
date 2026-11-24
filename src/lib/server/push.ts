import crypto from "node:crypto";
import { sendNotification, setVapidDetails } from "web-push";
import type { Emergencia, PrefsAlertas, SelectivaInfo } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { distanciaKm, formatoDistancia } from "@/lib/geo";
import { guardar, leer } from "./store";
import { obtenerBriefing } from "./ia";

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
    title: "Alerta 116 · Prueba",
    body: "Las notificaciones funcionan. Recibirás aquí las emergencias de tu zona.",
    url: "/",
    tag: "prueba",
  });
}

type Motivo = { tipo: "compania"; compania: number } | { tipo: "cercana"; km: number };

function motivoPara(sub: Suscripcion, e: Emergencia, maquinasNuevas?: string[]): Motivo | null {
  const p = sub.prefs;
  if (p.compania) {
    const enLista = (maquinasNuevas ?? e.maquinas).some((m) => {
      const n = m.match(/(\d+)/);
      return n && Number(n[1]) === p.compania;
    });
    if (enLista) return { tipo: "compania", compania: p.compania };
  }
  if (maquinasNuevas) return null; // en actualizaciones solo avisamos por compañía
  if (p.lat == null || p.lng == null || e.lat == null || e.lng == null) return null;
  if (!p.categorias.includes(e.categoria)) return null;
  const km = distanciaKm({ lat: p.lat, lng: p.lng }, { lat: e.lat, lng: e.lng });
  return km <= p.radioKm ? { tipo: "cercana", km } : null;
}

/**
 * Se llama cuando el monitor detecta una emergencia nueva o nuevas unidades.
 * Genera el resumen con IA solo si hay al menos un destinatario.
 */
export async function notificarEmergencia(e: Emergencia, maquinasNuevas?: string[]) {
  if (!configurarVapid()) return;
  const mapa = leer<Mapa>("suscripciones", {});
  const destinos: { sub: Suscripcion; motivo: Motivo }[] = [];
  for (const sub of Object.values(mapa)) {
    if (sub.notificados.includes(e.parte)) continue;
    const motivo = motivoPara(sub, e, maquinasNuevas);
    if (motivo) destinos.push({ sub, motivo });
  }
  if (destinos.length === 0) return;

  // Sin consulta extra al SGO: el resumen se arma con los datos que ya trajo el sondeo
  const briefing = await Promise.race([
    obtenerBriefing(e, [], "push"),
    new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
  ]).catch(() => null);

  const cat = CATEGORIAS[e.categoria];
  const lugar = [e.direccion, e.distrito].filter(Boolean).join(" · ");
  const cuerpo = briefing?.resumen || `${e.subtipo || e.tipoPrincipal}${lugar ? ` · ${lugar}` : ""}`;

  await Promise.all(
    destinos.map(async ({ sub, motivo }) => {
      const title =
        motivo.tipo === "compania"
          ? `B-${motivo.compania} DESPACHADA · ${e.tipoPrincipal}`
          : `${cat.corto.toUpperCase()} a ${formatoDistancia(motivo.km)} · ${e.distrito || "cerca"}`;
      const body = `${cuerpo}\n${e.maquinas.join(" · ")}`.trim();
      const ok = await enviar(sub, {
        title,
        body,
        url: `/emergencia/${e.parte}`,
        tag: `parte-${e.parte}`,
        categoria: e.categoria,
        urgente: motivo.tipo === "compania" || e.categoria === "incendio" || e.categoria === "matpel",
      });
      if (ok) {
        const actual = leer<Mapa>("suscripciones", {});
        const s = actual[sub.id];
        if (s) {
          s.notificados = [...s.notificados, e.parte].slice(-300);
          guardar("suscripciones", actual);
        }
      }
    }),
  );
  console.log(`[push] parte ${e.parte}: ${destinos.length} notificación(es)`);
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
        title: `Selectiva: la Central llama a ${sel.cia}${probable}`,
        body: `Canal 2 · ${hora}${sel.nombre ? ` · ${sel.nombre}` : ""}. Escucha la radio para el despacho.`,
        url: sel.parte ? `/emergencia/${sel.parte}` : "/radio",
        tag: `sel-${sel.epoch}`,
        urgente: true,
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
