import { EventEmitter } from "node:events";
import type { Emergencia, ParTonos, SelectivaInfo, Transmision } from "@/lib/types";
import { companiaDeUnidad } from "@/lib/categorias";
import { ciaDeNumero, ciaDePar, estacion, PARES_CONFIRMADOS } from "@/lib/estaciones";
import { getMonitor } from "../monitor";
import { guardar, leer } from "../store";
import { getTranscriptor } from "./transcriptor";
import { notificarSelectiva } from "../push";

/**
 * Selectivas del Canal 2 (detector de tonos de radio.lenznetwork.com → /selectivas.json).
 *
 * Ese JSON solo trae las últimas ~60 y no identifica la estación de muchos pares de tonos.
 * Aquí se guarda el historial y se APRENDE qué estación corresponde a cada par desconocido:
 * cada selectiva se cruza con lo que pasa justo después (partes del SGO y transmisiones que nombran
 * unidades). Dos cuidados, comprobados con datos reales:
 *  - La Central llama a VARIAS compañías seguidas para una misma emergencia, así que una selectiva
 *    aislada no basta: se acumula evidencia a lo largo de muchas.
 *  - Una estación muy activa aparece cerca de casi cualquier selectiva. Por eso no basta con que
 *    aparezca: debe aparecer con ESE par bastante más que con el resto (lift ≥ 2) y, como cada
 *    estación tiene un solo par, la asignación es uno a uno.
 */

const BASE = process.env.RADIO_BASE || "https://radio.lenznetwork.com";
const UA = "Mozilla/5.0 (compatible; Alerta116/1.0)";
const RETENCION_MS = 30 * 24 * 3600_000;

interface Registro {
  epoch: number;
  ts: string;
  par: string;
  a: number;
  b: number;
  /** Lo que dijo el detector de origen */
  ciaFuente: string | null;
  origenFuente: string | null;
  evaluada?: boolean;
}

// ── Evidencia y deducción (funciones puras) ───────────────────────────────

/**
 * Estaciones presentes alrededor de una selectiva a la hora T (ms), con su peso:
 *  - partes del SGO despachados entre 2 min antes y 4 min después;
 *  - transmisiones de los 90 s siguientes que nombran unidades (pesan más: suelen ser el despacho).
 * Solo cuentan estaciones de la IV CDLC que no estén en `excluir`.
 */
export function evidenciaSelectiva(
  T: number,
  emergencias: Emergencia[],
  transmisiones: Transmision[],
  excluir: Set<string> = new Set(),
): Map<string, number> {
  const evidencia = new Map<string, number>();
  const valida = (cia: string) => !!estacion(cia) && !excluir.has(cia);
  for (const e of emergencias) {
    const f = Date.parse(e.fecha);
    if (f < T - 120_000 || f > T + 240_000) continue;
    const cias = e.companias.map(ciaDeNumero).filter(valida);
    for (const c of cias) evidencia.set(c, (evidencia.get(c) ?? 0) + 1 / cias.length);
  }
  for (const t of transmisiones) {
    const i = Date.parse(t.ini);
    if (i < T - 5_000 || i > T + 90_000) continue;
    for (const u of t.unidades) {
      const n = companiaDeUnidad(u);
      const c = n !== null ? ciaDeNumero(n) : null;
      if (c && valida(c)) evidencia.set(c, (evidencia.get(c) ?? 0) + 1.5);
    }
  }
  return evidencia;
}

/** Conteos acumulados: en cuántas selectivas (con evidencia) apareció cada estación, en total y por par. */
export interface EvidenciaPares {
  N: number;
  base: Record<string, number>;
  pares: Record<string, { n: number; c: Record<string, number> }>;
}

export const evidenciaVacia = (): EvidenciaPares => ({ N: 0, base: {}, pares: {} });

export function acumularEvidencia(ev: EvidenciaPares, par: string, estaciones: Iterable<string>) {
  const set = [...new Set(estaciones)];
  if (!set.length) return;
  ev.N++;
  const p = (ev.pares[par] ??= { n: 0, c: {} });
  p.n++;
  for (const cia of set) {
    ev.base[cia] = (ev.base[cia] ?? 0) + 1;
    p.c[cia] = (p.c[cia] ?? 0) + 1;
  }
}

export interface Deduccion {
  cia: string;
  confianza: number;
  /** En cuántas apariciones del par estuvo la estación / apariciones con evidencia */
  coincidencias: number;
  apariciones: number;
  lift: number;
}

/**
 * Deduce el par de cada estación: debe estar en ≥ 3 apariciones y en ≥ 60 % de ellas, y con
 * lift ≥ 2 respecto de su presencia general. Asignación uno a uno por fuerza de evidencia.
 */
export function deducirPares(ev: EvidenciaPares, excluir: Set<string> = new Set()): Record<string, Deduccion> {
  const candidatos: (Deduccion & { par: string; puntaje: number })[] = [];
  for (const [par, p] of Object.entries(ev.pares)) {
    for (const [cia, c] of Object.entries(p.c)) {
      if (excluir.has(cia) || c < 3) continue;
      const tasa = c / p.n;
      const base = (ev.base[cia] ?? 0) / Math.max(1, ev.N);
      const lift = base > 0 ? tasa / base : 0;
      if (tasa < 0.6 || lift < 2) continue;
      // Confianza = cuánto supera al azar, normalizado (0 si es igual que la tasa base)
      const confianza = Math.min(0.95, Math.max(0, (tasa - base) / (1 - base || 1)));
      candidatos.push({ par, cia, confianza: Math.round(confianza * 100) / 100, coincidencias: c, apariciones: p.n, lift: Math.round(lift * 10) / 10, puntaje: c * lift });
    }
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  const out: Record<string, Deduccion> = {};
  const usadas = new Set<string>();
  for (const k of candidatos) {
    if (out[k.par] || usadas.has(k.cia)) continue;
    out[k.par] = { cia: k.cia, confianza: k.confianza, coincidencias: k.coincidencias, apariciones: k.apariciones, lift: k.lift };
    usadas.add(k.cia);
  }
  return out;
}

// ── Servicio ──────────────────────────────────────────────────────────────

class Selectivas extends EventEmitter {
  activo = false;
  private primeraCarga = true;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  historial(): Registro[] {
    return leer<Registro[]>("selectivas", []);
  }

  iniciar() {
    if (this.activo) return;
    this.activo = true;
    console.log("[selectivas] recolección y aprendizaje de pares de tonos activos");
    void this.sondear();
    setInterval(() => void this.sondear(), 15_000).unref?.();
    setInterval(() => this.aprender(), 120_000).unref?.();
  }

  private confirmadosFuente(): Record<string, string> {
    return leer<Record<string, string>>("pares_fuente", {});
  }

  /** Estaciones con par ya confirmado (no compiten por otros pares) */
  private ciasConfirmadas(): Set<string> {
    return new Set([...Object.values(PARES_CONFIRMADOS), ...Object.values(this.confirmadosFuente())]);
  }

  identificar(par: string, r?: Pick<Registro, "ciaFuente" | "origenFuente">): Pick<SelectivaInfo, "cia" | "origen" | "confianza"> {
    const fija = PARES_CONFIRMADOS[par] ?? this.confirmadosFuente()[par];
    if (fija) return { cia: fija, origen: "confirmada", confianza: 1 };
    if (r?.ciaFuente && r.origenFuente === "confirmado") return { cia: r.ciaFuente, origen: "confirmada", confianza: 1 };
    const d = leer<Record<string, Deduccion>>("pares_deducidos", {})[par];
    // Lo APRENDIDO de la radio manda sobre la fórmula cuando la evidencia es fuerte y la contradice
    // (así se descubrió que 2-16/2-17 es la B-11 y no la B-12).
    const decodificada = ciaDePar(par);
    if (d && d.cia !== decodificada && d.coincidencias >= 4 && d.confianza >= 0.5) {
      return { cia: d.cia, origen: "confirmada", confianza: d.confianza };
    }
    // El par codifica el número de compañía: identificación exacta sin necesidad de aprender
    if (decodificada) return { cia: decodificada, origen: "confirmada", confianza: 1 };
    if (d) return { cia: d.cia, origen: "inferida", confianza: d.confianza };
    // El detector de origen a veces propone una compañía sin confirmar
    if (r?.ciaFuente) return { cia: r.ciaFuente, origen: "inferida", confianza: 0.5 };
    return { cia: null, origen: null, confianza: null };
  }

  enriquecer(r: Registro): SelectivaInfo {
    const id = this.identificar(r.par, r);
    const est = estacion(id.cia);
    // Emergencia probable: la de esa estación despachada más cerca de la hora del tono
    let parte: string | null = null;
    if (id.cia) {
      const n = Number(id.cia.replace(/\D/g, ""));
      const T = r.epoch * 1000;
      const cand = getMonitor()
        .snapshot()
        .emergencias.filter((e) => e.companias.includes(n) && Math.abs(Date.parse(e.fecha) - T) < 10 * 60_000)
        .sort((a, b) => Math.abs(Date.parse(a.fecha) - T) - Math.abs(Date.parse(b.fecha) - T));
      parte = cand[0]?.parte ?? null;
    }
    return { epoch: r.epoch, ts: r.ts, par: r.par, a: r.a, b: r.b, ...id, nombre: est?.nombre ?? null, distrito: est?.distrito ?? null, parte };
  }

  recientes(n = 40): SelectivaInfo[] {
    return this.historial().slice(-n).reverse().map((r) => this.enriquecer(r));
  }

  tablaPares(): ParTonos[] {
    const ev = leer<EvidenciaPares>("pares_evidencia", evidenciaVacia());
    const veces = new Map<string, number>();
    for (const r of this.historial()) veces.set(r.par, (veces.get(r.par) ?? 0) + 1);
    const pares = new Set([...veces.keys(), ...Object.keys(PARES_CONFIRMADOS), ...Object.keys(this.confirmadosFuente())]);
    return [...pares]
      .map((par) => ({ par, ...this.identificar(par), veces: veces.get(par) ?? 0, votos: ev.pares[par]?.c ?? {} }))
      .sort((a, b) => b.veces - a.veces);
  }

  // ── Recolección ─────────────────────────────────────────────────────────
  private async sondear() {
    try {
      const r = await fetch(`${BASE}/selectivas.json`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return;
      const j = (await r.json()) as {
        selectivas?: { epoch: number; ts: string; a: number; b: number; par: string; cia: string | null; cia_origen: string | null }[];
      };
      const hist = this.historial();
      const vistos = new Set(hist.map((x) => `${x.epoch}|${x.par}`));
      const fuente = this.confirmadosFuente();
      const nuevas: Registro[] = [];
      for (const s of j.selectivas ?? []) {
        if (!s.par || !s.epoch) continue;
        // El detector de origen confirmó este par: se incorpora como confirmado
        if (s.cia && s.cia_origen === "confirmado" && !PARES_CONFIRMADOS[s.par] && fuente[s.par] !== s.cia) {
          fuente[s.par] = s.cia;
          guardar("pares_fuente", fuente);
        }
        if (vistos.has(`${s.epoch}|${s.par}`)) continue;
        const reg: Registro = { epoch: s.epoch, ts: s.ts, par: s.par, a: s.a, b: s.b, ciaFuente: s.cia, origenFuente: s.cia_origen };
        hist.push(reg);
        nuevas.push(reg);
      }
      if (!nuevas.length) return;
      const ahora = Date.now();
      guardar("selectivas", hist.filter((x) => ahora - x.epoch * 1000 < RETENCION_MS).sort((a, b) => a.epoch - b.epoch).slice(-5000));
      if (this.primeraCarga) return; // al arrancar solo se toma nota del historial
      for (const reg of nuevas) {
        if (ahora / 1000 - reg.epoch > 180) continue;
        const info = this.enriquecer(reg);
        this.emit("selectiva", info);
        console.log(`[selectivas] ${reg.par} → ${info.cia ?? "desconocida"}${info.origen === "inferida" ? ` (probable ${Math.round((info.confianza ?? 0) * 100)} %)` : ""}`);
        if (info.cia) notificarSelectiva(info).catch((err) => console.error("[selectivas] push:", (err as Error).message));
      }
    } catch {
      /* sin red: se reintenta en el próximo ciclo */
    } finally {
      this.primeraCarga = false;
    }
  }

  // ── Aprendizaje ─────────────────────────────────────────────────────────
  aprender() {
    const ahora = Date.now();
    const monitor = getMonitor().snapshot();
    const transmisiones = getTranscriptor().lista();
    const confirmadas = this.ciasConfirmadas();
    const ev = leer<EvidenciaPares>("pares_evidencia", evidenciaVacia());
    const hist = this.historial();
    let cambios = false;

    for (const r of hist) {
      const edad = ahora - r.epoch * 1000;
      // Se evalúa 4 min después (para que aparezca el parte) y hasta 3 h (lo que cubre el SGO en memoria)
      if (r.evaluada || edad < 4 * 60_000 || edad > 3 * 3600_000) continue;
      // Sin datos del SGO (caído o bloqueado) se reintenta más tarde
      if (!monitor.ok) continue;
      const estaciones = evidenciaSelectiva(r.epoch * 1000, monitor.emergencias, transmisiones, confirmadas).keys();
      acumularEvidencia(ev, r.par, estaciones);
      r.evaluada = true;
      cambios = true;
    }
    if (!cambios) return;
    guardar("selectivas", hist);
    guardar("pares_evidencia", ev);
    const deducidos = deducirPares(ev, confirmadas);
    guardar("pares_deducidos", deducidos);
    const n = Object.keys(deducidos).length;
    if (n) console.log(`[selectivas] pares deducidos: ${Object.entries(deducidos).map(([p, d]) => `${p}→${d.cia}`).join(", ")}`);
  }
}

const g = globalThis as unknown as { __selectivas116?: Selectivas };

export function getSelectivas(): Selectivas {
  return (g.__selectivas116 ??= new Selectivas());
}
