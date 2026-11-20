import * as cheerio from "cheerio";
import type { Emergencia, UnidadResumen } from "@/lib/types";
import { clasificar, companiaDeUnidad } from "@/lib/categorias";
import { parseFechaSgo } from "@/lib/tiempo";

/**
 * Fuente pública del CGBVP: emergencias de las últimas 24 h (SGO).
 * Cubre Lima, Callao y otras comandancias integradas (Ica, Ayacucho, Huaral, Barranca…).
 */
export const SGO_BASE = process.env.SGO_URL || "https://sgonorte.bomberosperu.gob.pe/24horas";
const UA = "Mozilla/5.0 (compatible; Alerta116/1.0)";

const limpiar = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

export function parseDireccion(texto: string) {
  const t = limpiar(texto);
  let calle = t;
  let lat: number | null = null;
  let lng: number | null = null;
  let resto = "";

  const m = t.match(/^(.*?)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*(.*)$/);
  if (m) {
    calle = m[1];
    const la = Number(m[2]);
    const ln = Number(m[3]);
    // (0,0) significa "sin georreferencia"; también descartamos valores fuera del Perú.
    if (la !== 0 && ln !== 0 && la < 1 && la > -19 && ln < -68 && ln > -82) {
      lat = la;
      lng = ln;
    }
    resto = m[4];
  } else {
    resto = t;
    calle = "";
  }

  let distrito = "";
  const idx = resto.lastIndexOf(" - ");
  let numeroTxt = resto;
  if (idx >= 0) {
    distrito = resto.slice(idx + 3).trim();
    numeroTxt = resto.slice(0, idx);
  } else if (resto.startsWith("- ")) {
    distrito = resto.slice(2).trim();
    numeroTxt = "";
  }
  if (!calle && numeroTxt) {
    calle = numeroTxt;
    numeroTxt = "";
  }
  const nro = numeroTxt.replace(/Nro\.?/i, "").trim();
  const direccion = limpiar(nro ? `${calle} Nro. ${nro}` : calle);
  return { direccion, distrito, lat, lng };
}

export type EmergenciaBase = Omit<Emergencia, "vistaEn">;

export function parseSgo(html: string, ahoraIso = new Date().toISOString()): EmergenciaBase[] {
  const $ = cheerio.load(html);
  const out: EmergenciaBase[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 6) return;
    const parte = limpiar($(tds[0]).text());
    if (!/^\d{6,}$/.test(parte)) return;

    const fecha = parseFechaSgo(limpiar($(tds[1]).text())) ?? ahoraIso;
    const { direccion, distrito, lat, lng } = parseDireccion($(tds[2]).text());
    const tipo = limpiar($(tds[3]).text());
    const estado = limpiar($(tds[4]).text()).toUpperCase();
    const maquinas = $(tds[5])
      .find("li")
      .map((_, li) => limpiar($(li).text()))
      .get()
      .filter(Boolean);

    const partes = tipo.split("/").map((s) => s.trim()).filter(Boolean);
    const companias = [
      ...new Set(maquinas.map(companiaDeUnidad).filter((n): n is number => n !== null)),
    ];

    out.push({
      parte,
      fecha,
      direccion,
      distrito,
      lat,
      lng,
      tipo,
      tipoPrincipal: partes[0] ?? tipo,
      subtipo: partes.slice(1).join(" / "),
      categoria: clasificar(tipo),
      estado: estado || "DESCONOCIDO",
      activa: estado !== "CERRADO" && !estado.includes("CANCELAD"),
      maquinas,
      companias,
    });
  });

  return out;
}

/** El SGO redirige a /Home/Forbidden (con reCAPTCHA) cuando limita una IP por exceso de consultas. */
export class SgoBloqueado extends Error {}

export async function obtenerEmergencias() {
  const res = await fetch(SGO_BASE, {
    headers: { "User-Agent": UA, "Accept-Language": "es-PE,es;q=0.9" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (res.url.includes("/Forbidden") || res.status === 403) {
    throw new SgoBloqueado("El SGO limitó temporalmente las consultas desde este servidor");
  }
  if (!res.ok) throw new Error(`SGO respondió HTTP ${res.status}`);
  const html = await res.text();
  if (html.includes("Acceso Prohibido")) {
    throw new SgoBloqueado("El SGO limitó temporalmente las consultas desde este servidor");
  }
  const lista = parseSgo(html);
  if (lista.length === 0 && !html.includes("<tbody")) {
    throw new Error("SGO devolvió una página sin tabla de emergencias");
  }
  return lista;
}

/**
 * Mientras el SGO nos tenga limitados (lo fija el monitor), no se hace NINGUNA consulta extra:
 * seguir consultando durante el bloqueo lo prolonga.
 */
let pausaHasta = 0;
export function pausarSgo(hastaMs: number) {
  pausaHasta = hastaMs;
}

const cacheResumen = new Map<string, { t: number; clave: string; data: UnidadResumen[] }>();

/**
 * Resumen de unidades por tipo (endpoint público Home/GetResume). Solo se pide al abrir el
 * detalle de una emergencia; se cachea 10 min o hasta que cambien las unidades despachadas.
 */
export async function obtenerResumenUnidades(parte: string, maquinas: string[] = []): Promise<UnidadResumen[]> {
  const clave = maquinas.join(",");
  const c = cacheResumen.get(parte);
  if (c && c.clave === clave && Date.now() - c.t < 10 * 60_000) return c.data;
  if (Date.now() < pausaHasta) return c?.data ?? [];
  try {
    const res = await fetch(
      `${SGO_BASE}/Home/GetResume?numeroparte=${encodeURIComponent(parte)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    if (res.url.includes("/Forbidden")) {
      pausarSgo(Date.now() + 10 * 60_000);
      return c?.data ?? [];
    }
    if (!res.ok) return c?.data ?? [];
    const json = (await res.json()) as { Codigo: string; TipoVehiculo: string; Cantidad: number }[];
    const data = (Array.isArray(json) ? json : []).map((u) => ({
      codigo: String(u.Codigo ?? ""),
      tipo: String(u.TipoVehiculo ?? "").trim(),
      cantidad: Number(u.Cantidad ?? 0),
    }));
    cacheResumen.set(parte, { t: Date.now(), clave, data });
    if (cacheResumen.size > 500) cacheResumen.delete(cacheResumen.keys().next().value!);
    return data;
  } catch {
    return c?.data ?? [];
  }
}
