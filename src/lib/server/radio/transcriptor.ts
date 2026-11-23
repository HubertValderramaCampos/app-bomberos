import { EventEmitter } from "node:events";
import { toFile } from "openai";
import type { Transmision } from "@/lib/types";
import { CANALES_RADIO } from "@/lib/canales";
import { clienteIA, IANoDisponible, registrarErrorIA } from "../ia";
import { getMonitor } from "../monitor";
import { guardar, leer } from "../store";
import { alinearFrame } from "./mp3";
import { extraerUnidades, vincularPorCodigo } from "./vinculo";
import { vincularConIA } from "./radio-ia";

/**
 * Escucha los canales de la radio de la IV CDLC y transcribe cada transmisión con Whisper.
 *
 * - Audio: un stream MP3 por canal (no el "Scan", que mezcla canales cuando hablan dos a la vez),
 *   cada uno en un búfer circular con la hora de llegada de cada bloque.
 * - Cuándo hay voz: un solo feed SSE /actividad del receptor SDR trae la portadora de todos los canales
 *   con su marca de tiempo `t`. Medido: el audio llega ~0,5 s después de `t`. Solo se transcribe lo que
 *   tiene portadora: no se paga por silencio y se evitan las "alucinaciones" de Whisper sobre ruido.
 * - Intercambios seguidos (hueco ≤ 3 s) se agrupan en una sola transmisión.
 */

const BASE = process.env.RADIO_BASE || "https://radio.lenznetwork.com";
const IDS_CANALES = (process.env.RADIO_CANALES || "C-2,C-1,C-3,C-4")
  .split(",")
  .map((s) => s.trim())
  .filter((id) => CANALES_RADIO[id]);
/**
 * scan (por defecto): un solo stream "Scan 1-4" (/todos.mp3) con todo lo que suena en cualquier canal;
 *   el feed de actividad dice qué canal hablaba para etiquetar cada transmisión.
 * canales: un stream por canal; audio más limpio cuando dos canales hablan a la vez, 4 conexiones.
 */
const FUENTE = process.env.RADIO_FUENTE === "canales" ? "canales" : "scan";
const MODELO = process.env.RADIO_MODELO_TRANSCRIPCION || "whisper-1";
// whisper-1 (OpenAI) y whisper-large-v3[-turbo] (Groq) devuelven segmentos con métricas de confianza.
const ES_WHISPER = /^whisper/i.test(MODELO);
// Con large-v3-turbo el prompt se repite en vez de transcribir el audio (probado con radio real): no se envía.
const USAR_PROMPT = !/turbo/i.test(MODELO);
const MAX_MIN_DIA = Number(process.env.RADIO_MAX_MIN_DIA) || 720; // tope de costo diario (todos los canales)
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
  /** Segundos con portadora por canal (con el Scan pueden ser varios) */
  porCanal: Record<string, number>;
  /** Segundos con dos o más canales hablando a la vez (audio superpuesto en el Scan) */
  solape: number;
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

/** Un canal: su stream de audio, su búfer y el recorte de transmisiones según la portadora. */
class Canal {
  audioOk = false;
  private chunks: { t: number; b: Buffer }[] = [];
  private seg: Segmento | null = null;
  private cierre: NodeJS.Timeout | null = null;
  private portadora = false;

  constructor(
    readonly id: string,
    private readonly mount: string,
    private readonly t: Transcriptor,
  ) {}

  async bucleAudio() {
    let espera = 2_000;
    for (;;) {
      try {
        const r = await fetch(`${BASE}${this.mount}?t=${Date.now()}`, { headers: { "User-Agent": UA }, cache: "no-store" });
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
        console.warn(`[radio] ${this.id} audio: ${(err as Error).message}; reintento en ${espera / 1000}s`);
        await sleep(espera);
        espera = Math.min(60_000, espera * 2);
      }
    }
  }

  private ultimoT: number | null = null;
  private activosPrev: string[] = [];

  /**
   * Estado de portadora en el instante t (lo reparte el feed de actividad). `activos` son los canales
   * que transmiten: en modo por canal, el propio; con el Scan, cualquiera de los 4.
   */
  alEstado(t: number, on: boolean, activos: string[] = on ? [this.id] : []) {
    // Tiempo transcurrido desde el evento anterior, atribuido a los canales que estaban hablando
    if (this.seg && this.ultimoT !== null && this.portadora) {
      const dt = Math.max(0, t - this.ultimoT);
      for (const c of this.activosPrev) this.seg.porCanal[c] = (this.seg.porCanal[c] ?? 0) + dt;
      if (this.activosPrev.length > 1) this.seg.solape += dt;
    }
    this.ultimoT = t;
    this.activosPrev = activos;

    // Portadora pegada (squelch abierto): cortar cada MAX_SEG para no acumular sin fin
    if (on && this.portadora && this.seg && t - this.seg.ini > MAX_SEG) {
      this.cerrarTramo(t);
      this.finalizar();
      this.abrirTramo(t, activos);
      return;
    }
    if (on && !this.portadora) this.abrirTramo(t, activos);
    else if (!on && this.portadora) this.cerrarTramo(t);
  }

  /** El feed se cortó: no dejar una transmisión abierta. */
  cortar(t: number) {
    if (this.portadora) this.cerrarTramo(t);
  }

  private abrirTramo(t: number, activos: string[]) {
    this.portadora = true;
    // Se agrupa con la transmisión anterior solo si es el mismo canal (un intercambio en C2 no se mezcla con C1)
    const mismoCanal = activos.some((c) => (this.seg?.porCanal[c] ?? 0) > 0);
    if (this.seg && this.seg.fin !== null && t - this.seg.fin <= FUSION && t - this.seg.ini < MAX_SEG && mismoCanal) {
      if (this.cierre) clearTimeout(this.cierre);
      this.cierre = null;
      this.seg.fin = null;
    } else {
      if (this.seg) this.finalizar();
      this.seg = { ini: t, fin: null, tramo: null, voz: 0, porCanal: {}, solape: 0 };
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
    const listoEn = (t + this.t.desfase + LATENCIA + POST) * 1000 - Date.now();
    if (this.cierre) clearTimeout(this.cierre);
    this.cierre = setTimeout(() => this.finalizar(), Math.max(0, listoEn) + FUSION * 1000);
  }

  private finalizar() {
    const s = this.seg;
    this.seg = null;
    if (this.cierre) clearTimeout(this.cierre);
    this.cierre = null;
    if (!s || s.fin === null || s.voz < MIN_VOZ) return;
    const desde = (s.ini + this.t.desfase + LATENCIA - PRE) * 1000;
    const hasta = (s.fin + this.t.desfase + LATENCIA + POST) * 1000;
    const audio = alinearFrame(Buffer.concat(this.chunks.filter((c) => c.t >= desde && c.t <= hasta).map((c) => c.b)));
    if (audio.length < 3_000) return;
    // Etiqueta: el canal que más habló; con el Scan pueden ser varios
    const canales = Object.entries(s.porCanal)
      .filter(([, seg]) => seg >= 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    this.t.encolar(canales[0] ?? this.id, s, audio, canales);
  }
}

class Transcriptor extends EventEmitter {
  activo = false;
  actividadOk = false;
  /** Desfase reloj local − reloj del receptor (mínimo observado ≈ retardo de red) */
  desfase = 0;
  private desfaseMin = Infinity;
  private ultimoT = 0;
  private canales: Canal[] = [];
  private cola: { canal: string; canales: string[]; seg: Segmento; audio: Buffer }[] = [];
  private enCurso = 0;
  private uso = { dia: "", seg: 0 };
  private intentosIA = new Map<string, number>();
  private hayNovedadIA = false;

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  /** true si todos los canales configurados reciben audio */
  get audioOk() {
    return this.canales.length > 0 && this.canales.every((c) => c.audioOk);
  }

  estadoCanales(): Record<string, boolean> {
    return Object.fromEntries(this.canales.map((c) => [c.id, c.audioOk]));
  }

  lista(): Transmision[] {
    return leer<Transmision[]>("transmisiones", []);
  }

  iniciar() {
    if (this.activo) return;
    this.activo = true;
    this.canales =
      FUENTE === "scan"
        ? [new Canal("SCAN", "/todos.mp3", this)]
        : IDS_CANALES.map((id) => new Canal(id, CANALES_RADIO[id].mount, this));
    console.log(
      `[radio] transcripción activa — ${FUENTE === "scan" ? "Scan 1-4" : "por canal"} (${IDS_CANALES.join(", ")}) con ${MODELO}, tope ${MAX_MIN_DIA} min/día`,
    );
    for (const c of this.canales) void c.bucleAudio();
    void this.bucleActividad();
    // Vinculación por IA de lo que no tenía código de unidad (y re-intento cuando aparece una emergencia nueva)
    // Cada 2 min se agrupan las pendientes en una sola consulta (antes 45 s): menos llamadas, mismo resultado.
    setInterval(() => void this.vincularPendientes(), 120_000).unref?.();
    getMonitor().on("evento", (ev: { tipo: string }) => {
      if (ev.tipo === "nueva") this.hayNovedadIA = true;
    });
  }

  // ── Actividad (cuándo hay portadora, todos los canales) ──────────────────
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
        for (const c of this.canales) c.cortar(this.ultimoT);
        console.warn(`[radio] actividad: ${(err as Error).message}; reintento en ${espera / 1000}s`);
        await sleep(espera);
        espera = Math.min(60_000, espera * 2);
      }
    }
  }

  private alEvento(d: { t: number; a: Record<string, number> }) {
    const edad = Date.now() / 1000 - d.t;
    if (edad > 30 || d.t <= this.ultimoT) return; // ráfaga de eventos viejos al conectar, o duplicados
    if (edad < this.desfaseMin) {
      this.desfaseMin = edad;
      this.desfase = edad;
    }
    this.ultimoT = d.t;
    if (FUENTE === "scan") {
      // Un solo audio: hay "portadora" si cualquiera de los canales configurados habla
      const activos = IDS_CANALES.filter((id) => (d.a[id] ?? 0) > 0);
      this.canales[0]?.alEstado(d.t, activos.length > 0, activos);
    } else {
      for (const c of this.canales) c.alEstado(d.t, (d.a[c.id] ?? 0) > 0);
    }
  }

  // ── Transcripción ───────────────────────────────────────────────────────
  encolar(canal: string, seg: Segmento, audio: Buffer, canales: string[] = [canal]) {
    this.cola.push({ canal, canales, seg, audio });
    void this.procesarCola();
  }

  private async procesarCola() {
    while (this.enCurso < 3 && this.cola.length) {
      const item = this.cola.shift()!;
      this.enCurso++;
      this.transcribir(item.canal, item.canales, item.seg, item.audio)
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

  private async transcribir(canal: string, canales: string[], s: Segmento, audio: Buffer) {
    const c = clienteIA();
    const duracionAudio = s.fin! - s.ini + PRE + POST;
    if (!this.dentroDelTope(duracionAudio)) {
      console.warn(`[radio] tope diario de ${MAX_MIN_DIA} min alcanzado; transmisión omitida`);
      return;
    }
    const file = await toFile(audio, "transmision.mp3", { type: "audio/mpeg" });
    let texto = "";
    try {
      if (ES_WHISPER) {
        const r = await c.audio.transcriptions.create({
          file,
          model: MODELO,
          language: "es",
          ...(USAR_PROMPT ? { prompt: PROMPT } : {}),
          temperature: 0,
          response_format: "verbose_json",
        });
        // Descarta fragmentos que Whisper marca como silencio, poco confiables o repetitivos
        texto = (r.segments ?? [])
          .filter((g) => !(g.no_speech_prob > 0.6 && g.avg_logprob < -1) && g.avg_logprob > -1.5 && g.compression_ratio < 2.4)
          .map((g) => g.text.trim())
          .join(" ");
      } else {
        const r = await c.audio.transcriptions.create({ file, model: MODELO, language: "es", ...(USAR_PROMPT ? { prompt: PROMPT } : {}) });
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
      id: `${canal}-${Math.round(s.ini * 1000)}`,
      canal,
      ini: new Date(s.ini * 1000).toISOString(),
      fin: new Date(s.fin! * 1000).toISOString(),
      duracion: Math.round(s.voz * 10) / 10,
      texto,
      unidades,
      partes,
      vinculo: partes.length ? "codigo" : null,
      ...(canales.length > 1 ? { canales, solapado: s.solape >= 0.5 } : {}),
    };
    this.guardarTx(tx);
    if (!partes.length) this.hayNovedadIA = true;
    console.log(`[radio] ${canales.join("+") || canal} ${tx.duracion}s${partes.length ? ` → #${partes.join(",")}` : ""}: ${texto.slice(0, 90)}`);
  }

  private guardarTx(tx: Transmision) {
    const ahora = Date.now();
    const lista = this.lista().filter((x) => x.id !== tx.id && ahora - new Date(x.ini).getTime() < RETENCION_MS);
    lista.push(tx);
    lista.sort((a, b) => a.ini.localeCompare(b.ini));
    guardar("transmisiones", lista.slice(-4000));
    this.emit("transmision", tx);
  }

  // ── Vinculación con IA ──────────────────────────────────────────────────
  private async vincularPendientes() {
    if (!this.hayNovedadIA) return;
    this.hayNovedadIA = false;
    const ahora = Date.now();
    const lista = this.lista();
    const recientes = lista.filter((t) => ahora - new Date(t.ini).getTime() < 15 * 60_000);
    // Menos de 3 palabras ("conforme", "adelante") no aporta para vincular: no se gasta en eso.
    const pendientes = recientes.filter(
      (t) => !t.partes.length && (this.intentosIA.get(t.id) ?? 0) < 2 && t.texto.split(/\s+/).filter(Boolean).length >= 3,
    );
    if (!pendientes.length) return;
    // Contexto acotado: emergencias de las últimas 2 h, las 25 más recientes
    const emergencias = getMonitor()
      .snapshot()
      .emergencias.filter((e) => ahora - new Date(e.fecha).getTime() < 2 * 3600_000)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 25);
    if (!emergencias.length) return;
    const contexto = recientes.filter((t) => !pendientes.includes(t)).slice(-8);
    try {
      const vinculos = await vincularConIA(pendientes.slice(-20), contexto, emergencias);
      for (const t of pendientes) this.intentosIA.set(t.id, (this.intentosIA.get(t.id) ?? 0) + 1);
      if (this.intentosIA.size > 4000) this.intentosIA.clear();
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
