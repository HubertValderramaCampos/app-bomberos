import { EventEmitter } from "node:events";
import type { Emergencia, Snapshot } from "@/lib/types";
import { obtenerEmergencias, pausarSgo, SgoBloqueado } from "./sgo";
import { notificarEmergencia, transferirNotificados } from "./push";
import { normUnidad, unidadesEnEmergencia } from "./unidades";

/** Una provisional por radio se une con la del SGO si este la despacha dentro de esta ventana. */
const UNIR_ANTES_MS = 5 * 60_000;
const UNIR_DESPUES_MS = 20 * 60_000;
/** Provisionales que el SGO nunca publicó se descartan pasado este tiempo. */
const VIDA_PROVISIONAL_MS = 45 * 60_000;

const normTexto = (t: string) =>
  t.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z ]/g, "").replace(/s+/g, " ").trim();

/** ¿La emergencia del SGO `e` es la misma que el despacho por radio `p`? */
function mismaEmergencia(p: Emergencia, e: Emergencia) {
  const dt = Date.parse(e.fecha) - Date.parse(p.fecha);
  if (dt < -UNIR_ANTES_MS || dt > UNIR_DESPUES_MS) return false;
  const ciasComunes = p.companias.filter((c) => e.companias.includes(c)).length;
  const unidadesComunes = p.maquinas.filter((m) => e.maquinas.some((x) => normUnidad(x) === normUnidad(m))).length;
  const mismoDistrito = !!p.distrito && normTexto(p.distrito) === normTexto(e.distrito);
  if (mismoDistrito && (ciasComunes > 0 || unidadesComunes > 0 || (!p.companias.length && !p.maquinas.length))) return true;
  return unidadesComunes >= 2 || (ciasComunes >= 2 && unidadesComunes >= 1);
}

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
  /** Despachos detectados por radio que el SGO aún no publica (id "R…") */
  private provisionalesMap = new Map<string, Emergencia>();
  /** Id provisional → parte del SGO, para que los enlaces "R…" sigan funcionando */
  private alias = new Map<string, string>();
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
    const enEmergencia = unidadesEnEmergencia();
    const conEstado = (e: Emergencia): Emergencia => {
      if (!enEmergencia.size || !e.activa) return e;
      const u = e.maquinas.filter((m) => enEmergencia.has(normUnidad(m)));
      return u.length ? { ...e, unidadesEnEmergencia: u } : e;
    };
    const emergencias = [...this.provisionalesMap.values(), ...this.emergencias.values()].map(conEstado).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.parte.localeCompare(a.parte));
    return { actualizado: this.actualizado, ok: this.ok, error: this.error, emergencias };
  }

  obtener(parte: string) {
    const real = this.alias.get(parte) ?? parte;
    return this.emergencias.get(real) ?? this.provisionalesMap.get(real) ?? null;
  }

  provisionales(): Emergencia[] {
    return [...this.provisionalesMap.values()];
  }

  /** Alta (o actualización) de un despacho detectado por radio. */
  agregarProvisional(e: Emergencia, nueva: boolean) {
    // Si el SGO ya la publicó, no se duplica
    const yaEnSgo = [...this.emergencias.values()].find((x) => mismaEmergencia(e, x));
    if (yaEnSgo) {
      this.alias.set(e.parte, yaEnSgo.parte);
      return;
    }
    this.provisionalesMap.set(e.parte, e);
    this.emitir({ tipo: "snapshot", data: this.snapshot() });
    if (nueva) {
      this.emitir({ tipo: "nueva", data: e });
      notificarEmergencia(e).catch((err) => console.error("[monitor] notificar radio:", err));
    }
  }

  /** Une provisionales con las emergencias del SGO; devuelve los partes del SGO que ya se avisaron por radio. */
  private unirProvisionales(vigentes: Map<string, Emergencia>): Set<string> {
    const avisadas = new Set<string>();
    for (const p of [...this.provisionalesMap.values()]) {
      const e = [...vigentes.values()].find((x) => !x.radio && mismaEmergencia(p, x));
      if (e) {
        e.radio = {
          texto: p.radio?.texto ?? "",
          selectivas: p.radio?.selectivas ?? [],
          anticipoSeg: Math.max(0, Math.round((Date.parse(e.vistaEn) - Date.parse(p.vistaEn)) / 1000)),
          provisional: p.parte,
        };
        this.alias.set(p.parte, e.parte);
        this.provisionalesMap.delete(p.parte);
        transferirNotificados(p.parte, e.parte);
        avisadas.add(e.parte);
        console.log(`[monitor] radio ${p.parte} confirmada como ${e.parte} (+${e.radio.anticipoSeg}s de adelanto)`);
      } else if (Date.now() - Date.parse(p.fecha) > VIDA_PROVISIONAL_MS) {
        this.provisionalesMap.delete(p.parte);
      }
    }
    if (this.alias.size > 500) this.alias = new Map([...this.alias].slice(-300));
    return avisadas;
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
        const e: Emergencia = { ...base, vistaEn: previa?.vistaEn ?? (this.primeraCarga ? base.fecha : ahora), radio: previa?.radio };
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

      const avisadasPorRadio = this.unirProvisionales(vigentes);
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
        if (!resincronizacion && reciente && !avisadasPorRadio.has(e.parte)) {
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
