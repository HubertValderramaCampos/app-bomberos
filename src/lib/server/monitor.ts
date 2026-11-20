import { EventEmitter } from "node:events";
import type { Emergencia, Snapshot } from "@/lib/types";
import { obtenerEmergencias, pausarSgo, SgoBloqueado } from "./sgo";
import { notificarEmergencia } from "./push";

/** Una sola consulta por intervalo para TODOS los usuarios: no se debe saturar el portal del CGBVP. */
const POLL_MS = Math.max(30_000, Number(process.env.SGO_POLL_MS) || 60_000);
/** Tras un fallo se espera más antes de reintentar (exponencial, máx. 30 min). */
const ESPERA_MAX_MS = 30 * 60_000;
/** Si en un solo ciclo aparecen más de N "nuevas", es una resincronización (p. ej. tras una caída), no se notifica. */
const MAX_NUEVAS_POR_CICLO = 12;
/** Solo se notifican emergencias despachadas hace menos de esto. */
const VENTANA_NOTIFICACION_MS = 30 * 60_000;

export type EventoMonitor =
  | { tipo: "snapshot"; data: Snapshot }
  | { tipo: "estado"; data: Omit<Snapshot, "emergencias"> }
  | { tipo: "nueva"; data: Emergencia }
  | { tipo: "actualizada"; data: { emergencia: Emergencia; cambios: string[] } };

class Monitor extends EventEmitter {
  private emergencias = new Map<string, Emergencia>();
  private actualizado: string | null = null;
  private error: string | null = null;
  private ok = false;
  private primeraCarga = true;
  private timer: NodeJS.Timeout | null = null;
  private corriendo = false;
  private fallosSeguidos = 0;
  private esperarHasta = 0;
  private listo: Promise<void>;
  private resolverListo!: () => void;

  constructor() {
    super();
    this.setMaxListeners(0);
    this.listo = new Promise((r) => (this.resolverListo = r));
  }

  iniciar() {
    if (this.timer) return;
    console.log(`[monitor] iniciando — SGO cada ${POLL_MS / 1000}s`);
    void this.ciclo();
    this.timer = setInterval(() => void this.ciclo(), POLL_MS);
    this.timer.unref?.();
  }

  /** Espera la primera carga (máx. `ms`) para que la primera petición no llegue vacía. */
  async esperarListo(ms = 8_000) {
    await Promise.race([this.listo, new Promise((r) => setTimeout(r, ms))]);
  }

  snapshot(): Snapshot {
    const emergencias = [...this.emergencias.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.parte.localeCompare(a.parte));
    return { actualizado: this.actualizado, ok: this.ok, error: this.error, emergencias };
  }

  obtener(parte: string) {
    return this.emergencias.get(parte) ?? null;
  }

  private emitir(ev: EventoMonitor) {
    this.emit("evento", ev);
  }

  private async ciclo() {
    if (this.corriendo || Date.now() < this.esperarHasta) return;
    this.corriendo = true;
    try {
      const lista = await obtenerEmergencias();
      const ahora = new Date().toISOString();
      const nuevas: Emergencia[] = [];
      const actualizadas: { emergencia: Emergencia; cambios: string[]; maquinasNuevas: string[] }[] = [];
      const vigentes = new Map<string, Emergencia>();

      for (const base of lista) {
        const previa = this.emergencias.get(base.parte);
        const e: Emergencia = { ...base, vistaEn: previa?.vistaEn ?? (this.primeraCarga ? base.fecha : ahora) };
        vigentes.set(e.parte, e);
        if (!previa) {
          if (!this.primeraCarga) nuevas.push(e);
          continue;
        }
        const cambios: string[] = [];
        if (previa.estado !== e.estado) cambios.push(`estado:${previa.estado}→${e.estado}`);
        const maquinasNuevas = e.maquinas.filter((m) => !previa.maquinas.includes(m));
        if (maquinasNuevas.length) cambios.push(`unidades:+${maquinasNuevas.join(",")}`);
        if (previa.tipo !== e.tipo) cambios.push(`tipo:${e.tipo}`);
        if (cambios.length) actualizadas.push({ emergencia: e, cambios, maquinasNuevas });
      }

      const huboCambios =
        this.primeraCarga ||
        nuevas.length > 0 ||
        actualizadas.length > 0 ||
        vigentes.size !== this.emergencias.size ||
        !this.ok;

      this.emergencias = vigentes;
      this.actualizado = ahora;
      this.ok = true;
      this.error = null;
      this.fallosSeguidos = 0;
      this.esperarHasta = 0;

      if (huboCambios) this.emitir({ tipo: "snapshot", data: this.snapshot() });
      else this.emitir({ tipo: "estado", data: { actualizado: ahora, ok: true, error: null } });

      const resincronizacion = nuevas.length > MAX_NUEVAS_POR_CICLO;
      for (const e of nuevas) {
        this.emitir({ tipo: "nueva", data: e });
        const reciente = Date.now() - new Date(e.fecha).getTime() < VENTANA_NOTIFICACION_MS;
        if (!resincronizacion && reciente) {
          notificarEmergencia(e).catch((err) => console.error("[monitor] notificar:", err));
        }
      }
      for (const a of actualizadas) {
        this.emitir({ tipo: "actualizada", data: { emergencia: a.emergencia, cambios: a.cambios } });
        if (a.maquinasNuevas.length && a.emergencia.activa) {
          notificarEmergencia(a.emergencia, a.maquinasNuevas).catch((err) => console.error("[monitor] notificar:", err));
        }
      }

      if (nuevas.length) console.log(`[monitor] ${nuevas.length} nueva(s): ${nuevas.map((e) => e.parte).join(", ")}`);
    } catch (err) {
      this.ok = false;
      this.fallosSeguidos++;
      const bloqueado = err instanceof SgoBloqueado;
      // Si el portal nos limitó, no insistimos: esperar ayuda a que levante el bloqueo.
      const base = bloqueado ? 10 * 60_000 : POLL_MS;
      const espera = Math.min(ESPERA_MAX_MS, base * 2 ** Math.min(this.fallosSeguidos - 1, 5));
      this.esperarHasta = Date.now() + espera;
      if (bloqueado) pausarSgo(this.esperarHasta);
      this.error = `${(err as Error).message}. Reintento en ${Math.round(espera / 60_000) || 1} min.`;
      console.error("[monitor] error consultando SGO:", this.error);
      this.emitir({ tipo: "estado", data: { actualizado: this.actualizado, ok: false, error: this.error } });
    } finally {
      if (this.primeraCarga && this.ok) this.primeraCarga = false;
      this.corriendo = false;
      this.resolverListo();
    }
  }
}

const g = globalThis as unknown as { __monitor116?: Monitor };

export function getMonitor(): Monitor {
  if (!g.__monitor116) {
    g.__monitor116 = new Monitor();
    if (process.env.MONITOR_DESACTIVADO !== "1") g.__monitor116.iniciar();
  }
  return g.__monitor116;
}
