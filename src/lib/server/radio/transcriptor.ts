import { EventEmitter } from "node:events";
import { toFile } from "openai";
import type { Transmision } from "@/lib/types";
import { clienteIA, IANoDisponible, registrarErrorIA } from "../ia";
import { getMonitor } from "../monitor";
import { guardar, leer } from "../store";
import { alinearFrame } from "./mp3";
import { extraerUnidades, vincularPorCodigo } from "./vinculo";
import { vincularConIA } from "./radio-ia";

/**
 * Escucha la Central de Emergencias (Canal 2) y transcribe cada transmisión con Whisper.
 *
 * - Audio: stream MP3 de Icecast en un búfer circular con la hora de llegada de cada bloque.
 * - Cuándo hay voz: el feed SSE /actividad del receptor SDR (portadora por canal, con su propia marca
 *   de tiempo `t`). Medido: el audio llega ~0,5 s después de `t`. Solo se transcribe lo que tiene portadora,
 *   así no se paga por silencio y se evitan las "alucinaciones" de Whisper sobre ruido.
 * - Intercambios seguidos (hueco ≤ 3 s) se agrupan en una sola transmisión.
 */

const BASE = process.env.RADIO_BASE || "https://radio.lenznetwork.com";
const CANAL = { id: "C-2", mount: "/sdr-canal2.mp3" };
const MODELO = process.env.RADIO_MODELO_TRANSCRIPCION || "whisper-1";
const MAX_MIN_DIA = Number(process.env.RADIO_MAX_MIN_DIA) || 480; // tope de costo: 8 h de audio/día
const UA = "Mozilla/5.0 (compatible; Alerta116/1.0)";

const LATENCIA = 0.5; // s entre `t` de actividad y llegada del audio
const PRE = 0.8;
const POST = 1.0;
const FUSION = 3; // s de silencio que separan transmisiones distintas
const MIN_VOZ = 0.8; // s; menos es un "click" de PTT
const MAX_SEG = 60; // s por transmisión agrupada
const BUFFER_MS = 180_000;
const RETENCION_MS = 24 * 3600_000;

// Vocabulario para Whisper: formato de unidades y de claves CGBVP (se dicen "diez treinta y tres" → 10-33)
const PROMPT =
  "Radio de bomberos, Central de Emergencias, Lima. Unidades M150-1, AMB-28, RES-10, CIST-38, RESLIG-127. Claves 10-19, 10-20, 10-24, 10-33, 20-15, 20-23, X-7. Central, adelante, conforme, en ruta.";

const ALUCINACIONES = /amara\.org|subt[ií]tul|gracias por ver|suscr[ií]b|www\.|\.com\b|^\W*$/i;

interface Segmento {
  ini: number; // epoch s (reloj del receptor)
  fin: number | null;
  tramo: number | null; // inicio del tramo con portadora en curso
  voz: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const palabras = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** ¿El texto repite el prompt? (fallo típico de los modelos de transcripción con audio corto) */
function repitePrompt(texto: string): boolean {
  const p = palabras(PROMPT);
  const grams = new Set(p.slice(0, -3).map((_, i) => p.slice(i, i + 4).join(" ")));
  const t = palabras(texto);
  for (let i = 0; i + 4 <= t.length; i++) if (grams.has(t.slice(i, i + 4).join(" "))) return true;
  return false;
}

class Transcriptor extends EventEmitter {
  activo = false;
  audioOk = false;
  actividadOk = false;
  private chunks: { t: number; b: Buffer }[] = [];
  private seg: Segmento | null = null;
  private cierre: NodeJS.Timeout | null = null;
  private portadora = false;
  private ultimoT = 0;
  /** Desfase reloj local − reloj del receptor (mínimo observado ≈ retardo de red) */
  private desfase = 0;
  private desfaseMin = Infinity;
  private cola: { seg: Segmento; audio: Buffer }[] = [];
  private enCurso = 0;
  private uso = { dia: "", seg: 0 };
  private intentosIA = new Map<string, number>();
  private hayNovedadIA = false;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  lista(): Transmision[] {
    return leer<Transmision[]>("transmisiones", []);
  }

  iniciar() {
    if (this.activo) return;
    this.activo = true;
    console.log(`[radio] transcripción activa — ${CANAL.id} (${CANAL.mount}) con ${MODELO}`);
    void this.bucleAudio();
    void this.bucleActividad();
    // Vinculación por IA de lo que no tenía código de unidad (y re-intento cuando aparece una emergencia nueva)
    setInterval(() => void this.vincularPendientes(), 45_000).unref?.();
    getMonitor().on("evento", (ev: { tipo: string }) => {
      if (ev.tipo === "nueva") this.hayNovedadIA = true;
    });
  }

  // ── Audio ────────────────────────────────────────────────────────────────
  private async bucleAudio() {
    let espera = 2_000;
    for (;;) {
      try {
        const r = await fetch(`${BASE}${CANAL.mount}?t=${Date.now()}`, { headers: { "User-Agent": UA }, cache: "no-store" });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        this.audioOk = true;
        espera = 2_000;
        for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
          const t = Date.now();
          this.chunks.push({ t, b: Buffer.from(c) });
          while (this.chunks.length && t - this.chunks[0].t > BUFFER_MS) this.chunks.shift();
        }
        throw new Error("el stream terminó");
      } catch (err) {
        this.audioOk = false;
        console.warn(`[radio] audio: ${(err as Error).message}; reintento en ${espera / 1000}s`);
        await sleep(espera);
        espera = Math.min(60_000, espera * 2);
      }
    }
  }

  // ── Actividad (cuándo hay portadora) ─────────────────────────────────────
  private async bucleActividad() {
    let espera = 2_000;
    for (;;) {
      try {
        const r = await fetch(`${BASE}/actividad`, { headers: { "User-Agent": UA }, cache: "no-store" });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        this.actividadOk = true;
        espera = 2_000;
        const dec = new TextDecoder();
        let buf = "";
        for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
          buf += dec.decode(c, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const bloque = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const linea = bloque.split("\n").find((l) => l.startsWith("data:"));
            if (!linea) continue;
            try {
              this.alEvento(JSON.parse(linea.slice(5)) as { t: number; a: Record<string, number> });
            } catch {
              /* evento malformado */
            }
          }
        }
        throw new Error("el feed terminó");
      } catch (err) {
        this.actividadOk = false;
        if (this.seg) this.cerrarTramo(this.ultimoT); // no dejar una transmisión abierta
        console.warn(`[radio] actividad: ${(err as Error).message}; reintento en ${espera / 1000}s`);
        await sleep(espera);
        espera = Math.min(60_000, espera * 2);
      }
    }
  }

  private alEvento(d: { t: number; a: Record<string, number> }) {
    const ahora = Date.now() / 1000;
    const edad = ahora - d.t;
    if (edad > 30 || d.t <= this.ultimoT) return; // ráfaga de eventos viejos al conectar, o duplicados
    if (edad < this.desfaseMin) {
      this.desfaseMin = edad;
      this.desfase = edad;
    }
    this.ultimoT = d.t;
    const on = (d.a[CANAL.id] ?? 0) > 0;

    // Portadora pegada (squelch abierto): cortar cada MAX_SEG para no acumular sin fin
    if (on && this.portadora && this.seg && d.t - this.seg.ini > MAX_SEG) {
      this.cerrarTramo(d.t);
      this.finalizar();
      this.abrirTramo(d.t);
      return;
    }
    if (on && !this.portadora) this.abrirTramo(d.t);
    else if (!on && this.portadora) this.cerrarTramo(d.t);
  }

  private abrirTramo(t: number) {
    this.portadora = true;
    if (this.seg && this.seg.fin !== null && t - this.seg.fin <= FUSION && t - this.seg.ini < MAX_SEG) {
      if (this.cierre) clearTimeout(this.cierre);
      this.cierre = null;
      this.seg.fin = null;
    } else {
      if (this.seg) this.finalizar();
      this.seg = { ini: t, fin: null, tramo: null, voz: 0 };
    }
    this.seg.tramo = t;
  }

  private cerrarTramo(t: number) {
    this.portadora = false;
    const s = this.seg;
    if (!s || s.tramo === null) return;
    s.voz += Math.max(0, t - s.tramo);
    s.tramo = null;
    s.fin = t;
    // Esperar a que llegue el audio del final + la ventana para agrupar respuestas
    const listoEn = (t + this.desfase + LATENCIA + POST) * 1000 - Date.now();
    if (this.cierre) clearTimeout(this.cierre);
    this.cierre = setTimeout(() => this.finalizar(), Math.max(0, listoEn) + FUSION * 1000);
  }

  private finalizar() {
    const s = this.seg;
    this.seg = null;
    if (this.cierre) clearTimeout(this.cierre);
    this.cierre = null;
    if (!s || s.fin === null || s.voz < MIN_VOZ) return;
    const desde = (s.ini + this.desfase + LATENCIA - PRE) * 1000;
    const hasta = (s.fin + this.desfase + LATENCIA + POST) * 1000;
    const partes = this.chunks.filter((c) => c.t >= desde && c.t <= hasta).map((c) => c.b);
    const audio = alinearFrame(Buffer.concat(partes));
    if (audio.length < 3_000) return;
    this.cola.push({ seg: s, audio });
    void this.procesarCola();
  }

  // ── Transcripción ───────────────────────────────────────────────────────
  private async procesarCola() {
    while (this.enCurso < 2 && this.cola.length) {
      const item = this.cola.shift()!;
      this.enCurso++;
      this.transcribir(item.seg, item.audio)
        .catch((err) => {
          if (!(err instanceof IANoDisponible)) console.error("[radio] transcripción:", (err as Error).message);
        })
        .finally(() => {
          this.enCurso--;
          void this.procesarCola();
        });
    }
  }

  private dentroDelTope(segundos: number) {
    const dia = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima" });
    if (this.uso.dia !== dia) this.uso = { dia, seg: 0 };
    if (this.uso.seg + segundos > MAX_MIN_DIA * 60) return false;
    this.uso.seg += segundos;
    return true;
  }

  private async transcribir(s: Segmento, audio: Buffer) {
    const c = clienteIA();
    const duracionAudio = s.fin! - s.ini + PRE + POST;
    if (!this.dentroDelTope(duracionAudio)) {
      console.warn(`[radio] tope diario de ${MAX_MIN_DIA} min alcanzado; transmisión omitida`);
      return;
    }
    const file = await toFile(audio, "transmision.mp3", { type: "audio/mpeg" });
    let texto = "";
    try {
      if (MODELO === "whisper-1") {
        const r = await c.audio.transcriptions.create({
          file,
          model: MODELO,
          language: "es",
          prompt: PROMPT,
          temperature: 0,
          response_format: "verbose_json",
        });
        // Descarta fragmentos que Whisper marca como silencio, poco confiables o repetitivos
        texto = (r.segments ?? [])
          .filter((g) => !(g.no_speech_prob > 0.6 && g.avg_logprob < -1) && g.avg_logprob > -1.5 && g.compression_ratio < 2.4)
          .map((g) => g.text.trim())
          .join(" ");
      } else {
        const r = await c.audio.transcriptions.create({ file, model: MODELO, language: "es", prompt: PROMPT });
        texto = r.text;
      }
    } catch (err) {
      registrarErrorIA(err);
    }
    texto = texto.replace(/\s+/g, " ").trim();
    if (!texto || ALUCINACIONES.test(texto) || repitePrompt(texto)) return;

    const unidades = extraerUnidades(texto);
    const partes = vincularPorCodigo(unidades, getMonitor().snapshot().emergencias);
    const tx: Transmision = {
      id: `${CANAL.id}-${Math.round(s.ini * 1000)}`,
      canal: CANAL.id,
      ini: new Date(s.ini * 1000).toISOString(),
      fin: new Date(s.fin! * 1000).toISOString(),
      duracion: Math.round(s.voz * 10) / 10,
      texto,
      unidades,
      partes,
      vinculo: partes.length ? "codigo" : null,
    };
    this.guardarTx(tx);
    if (!partes.length) this.hayNovedadIA = true;
    console.log(`[radio] ${tx.duracion}s${partes.length ? ` → #${partes.join(",")}` : ""}: ${texto.slice(0, 90)}`);
  }

  private guardarTx(tx: Transmision) {
    const ahora = Date.now();
    const lista = this.lista().filter((x) => x.id !== tx.id && ahora - new Date(x.ini).getTime() < RETENCION_MS);
    lista.push(tx);
    lista.sort((a, b) => a.ini.localeCompare(b.ini));
    guardar("transmisiones", lista.slice(-2000));
    this.emit("transmision", tx);
  }

  // ── Vinculación con IA ──────────────────────────────────────────────────
  private async vincularPendientes() {
    if (!this.hayNovedadIA) return;
    this.hayNovedadIA = false;
    const ahora = Date.now();
    const lista = this.lista();
    const recientes = lista.filter((t) => ahora - new Date(t.ini).getTime() < 15 * 60_000);
    const pendientes = recientes.filter((t) => !t.partes.length && (this.intentosIA.get(t.id) ?? 0) < 3);
    if (!pendientes.length) return;
    const emergencias = getMonitor()
      .snapshot()
      .emergencias.filter((e) => ahora - new Date(e.fecha).getTime() < 3 * 3600_000);
    if (!emergencias.length) return;
    const contexto = recientes.filter((t) => !pendientes.includes(t)).slice(-12);
    try {
      const vinculos = await vincularConIA(pendientes.slice(-25), contexto, emergencias);
      for (const t of pendientes) this.intentosIA.set(t.id, (this.intentosIA.get(t.id) ?? 0) + 1);
      if (this.intentosIA.size > 2000) this.intentosIA.clear();
      for (const [id, parte] of Object.entries(vinculos)) {
        if (!parte) continue;
        const tx = this.lista().find((x) => x.id === id);
        if (tx && !tx.partes.length) this.guardarTx({ ...tx, partes: [parte], vinculo: "ia" });
      }
    } catch (err) {
      if (!(err instanceof IANoDisponible)) console.error("[radio] vinculación IA:", (err as Error).message);
    }
  }
}

const g = globalThis as unknown as { __transcriptor116?: Transcriptor };

export function getTranscriptor(): Transcriptor {
  return (g.__transcriptor116 ??= new Transcriptor());
}

export function transcripcionHabilitada() {
  return process.env.RADIO_TRANSCRIPCION !== "0" && !!process.env.OPENAI_API_KEY;
}
