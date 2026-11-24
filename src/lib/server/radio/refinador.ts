import fs from "node:fs";
import path from "node:path";
import { toFile } from "openai";
import type { Emergencia, Transmision } from "@/lib/types";
import { CLAVES } from "@/lib/claves";
import { clienteIA, completarJSON, registrarErrorIA } from "../ia";
import { getMonitor } from "../monitor";
import { duracionMp3 } from "./mp3";
import { extraerUnidades, vincularPorCodigo } from "./vinculo";

/**
 * Segunda pasada de transcripción: precisión antes que rapidez.
 *
 * La primera pasada (transcriptor.ts) es inmediata, para alertar. Esta espera a que termine la conversación
 * de un canal, junta el audio grabado de todas sus transmisiones y:
 *  1. Lo vuelve a transcribir con Whisper large-v3 de una sola vez (más audio = más contexto para el modelo),
 *     con un prompt armado con las unidades, direcciones y distritos de las emergencias en curso y con lo
 *     que se dijo antes en ese canal.
 *  2. Un modelo de lenguaje compara ambas versiones y corrige lo mal oído usando ese contexto (unidades
 *     despachadas, calles, claves), sin inventar: lo que no se entiende queda como [inaudible].
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DIR_AUDIO = path.join(DATA_DIR, "audio");
const RETENCION_AUDIO_MS = 6 * 3600_000;
/** Silencio en el canal que da por terminada una conversación */
const FIN_CONVERSACION_S = 75;
/** Hueco máximo entre transmisiones de una misma conversación */
const HUECO_S = 40;
const MAX_AUDIO_S = 150;
const MODELO_WHISPER = process.env.RADIO_MODELO_REFINADO || "whisper-large-v3";
const MODELO_LLM = process.env.RADIO_MODELO_CORRECCION || process.env.OPENAI_MODEL_RESUMEN || "openai/gpt-oss-20b";

export interface Almacen {
  lista(): Transmision[];
  reemplazar(tx: Transmision): void;
}

const rutaAudio = (id: string) => path.join(DIR_AUDIO, `${id}.mp3`);

export function guardarAudio(id: string, audio: Buffer) {
  try {
    fs.mkdirSync(DIR_AUDIO, { recursive: true });
    fs.writeFileSync(rutaAudio(id), audio);
  } catch (err) {
    console.warn("[refinado] no se pudo guardar el audio:", (err as Error).message);
  }
}

function limpiarAudios() {
  try {
    const ahora = Date.now();
    for (const f of fs.readdirSync(DIR_AUDIO)) {
      const p = path.join(DIR_AUDIO, f);
      if (ahora - fs.statSync(p).mtimeMs > RETENCION_AUDIO_MS) fs.unlinkSync(p);
    }
  } catch {
    /* carpeta inexistente */
  }
}

// ── Contexto ───────────────────────────────────────────────────────────────
const HABLADO: [RegExp, string][] = [
  [/^RESLIG/, "rescate ligera "],
  [/^MATPEL/, "matpel "],
  [/^CIST/, "cisterna "],
  [/^AMB/, "ambulancia "],
  [/^RES/, "rescate "],
  [/^ESC/, "escala "],
  [/^MED/, "médica "],
  [/^PLT/, "plataforma "],
  [/^M/, "máquina "],
];
const hablarUnidad = (u: string) => {
  for (const [re, w] of HABLADO) if (re.test(u)) return (w + u.replace(re, "").replace(/^-/, "")).trim();
  return u;
};
const hablarDireccion = (d: string) =>
  d
    .replace(/\bAV\.?\s/gi, "avenida ")
    .replace(/\bJR\.?\s/gi, "jirón ")
    .replace(/\bCL\.?\s/gi, "calle ")
    .replace(/\bPJ\.?\s/gi, "pasaje ")
    .replace(/\bPR\.?\s/gi, "prolongación ")
    .replace(/\bNro\.?\s?/gi, "")
    .replace(/\([A-Z]\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Emergencias en curso o de las últimas horas: las que probablemente se mencionan en la radio. */
function emergenciasDeContexto(ini: number): Emergencia[] {
  return getMonitor()
    .snapshot()
    .emergencias.filter((e) => e.activa || Math.abs(new Date(e.fecha).getTime() - ini) < 2 * 3600_000)
    .slice(0, 25);
}

/** Prompt de Whisper (máx. ~224 tokens): vocabulario del momento + lo último dicho en el canal. */
function promptWhisper(emergencias: Emergencia[], previo: string): string {
  const unidades = [...new Set(emergencias.flatMap((e) => e.maquinas))].slice(0, 16).map(hablarUnidad);
  const lugares = [...new Set(emergencias.slice(0, 6).map((e) => `${hablarDireccion(e.direccion)}, ${e.distrito.toLowerCase()}`))];
  const base = `Radio de la Central de Bomberos, Lima. Unidades: ${unidades.join(", ")}. Lugares: ${lugares.join("; ")}. Claves 10-04, 10-20, 10-33.`;
  return `${base.slice(0, 480)}${previo ? ` ${previo.slice(-220)}` : ""}`;
}

const CLAVES_TXT = CLAVES.filter((c) => /^(10|20|30)-/.test(c.codigo))
  .map((c) => `${c.codigo} ${c.significado}`)
  .join("; ");

// ── Pasadas ────────────────────────────────────────────────────────────────
interface Pieza {
  tx: Transmision;
  audio: Buffer;
  desde: number;
  hasta: number;
}

async function retranscribir(piezas: Pieza[], prompt: string): Promise<Map<string, string>> {
  const r = await clienteIA().audio.transcriptions.create({
    file: await toFile(Buffer.concat(piezas.map((p) => p.audio)), "conversacion.mp3", { type: "audio/mpeg" }),
    model: MODELO_WHISPER,
    language: "es",
    prompt,
    temperature: 0,
    response_format: "verbose_json",
  });
  const out = new Map<string, string[]>();
  for (const g of r.segments ?? []) {
    if (g.no_speech_prob > 0.6 && g.avg_logprob < -1) continue;
    if (g.avg_logprob < -1.5 || g.compression_ratio > 2.4) continue;
    const medio = (g.start + g.end) / 2;
    const p = piezas.find((x) => medio >= x.desde && medio < x.hasta) ?? piezas[piezas.length - 1];
    out.set(p.tx.id, [...(out.get(p.tx.id) ?? []), g.text.trim()]);
  }
  return new Map([...out].map(([k, v]) => [k, v.join(" ").replace(/\s+/g, " ").trim()]));
}

async function corregir(piezas: Pieza[], segunda: Map<string, string>, emergencias: Emergencia[], previo: string) {
  const ctx = emergencias
    .slice(0, 15)
    .map((e) => `#${e.parte} ${e.tipoPrincipal} · ${e.direccion} · ${e.distrito} · ${e.maquinas.join(", ")}`)
    .join("\n");
  const items = piezas.map((p, i) => ({
    id: String(i + 1),
    seg: Math.round(p.hasta - p.desde),
    a: p.tx.textoRapido ?? p.tx.texto,
    b: segunda.get(p.tx.id) ?? "",
  }));
  const r = await completarJSON<{ transmisiones: { id: string; texto: string }[] }>({
    modelo: MODELO_LLM,
    esfuerzo: "medium",
    nombre: "correccion_radio",
    prioridad: "baja",
    presupuesto: false,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["transmisiones"],
      properties: {
        transmisiones: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "texto"],
            properties: { id: { type: "string" }, texto: { type: "string" } },
          },
        },
      },
    },
    sistema: `Corriges transcripciones automáticas de la radio de los Bomberos de Lima (CGBVP). Cada transmisión tiene dos versiones de Whisper del mismo audio: "a" (solo ese tramo, sin contexto) y "b" (la conversación completa con vocabulario del momento; suele ser mejor). Escribe el texto más fiel a lo que realmente se dijo.
Reglas:
- Usa el contexto: unidades despachadas, direcciones y distritos de las emergencias en curso, y las claves. Si algo suena parecido a una unidad, calle o distrito del contexto, corrígelo ("comercio 127-1" → "máquina 127-1"; "cove 73" → "AMB-73" solo si encaja).
- Unidades como se dicen: máquina 127-1, ambulancia 96-1, médica 28, rescate 2. Claves y números en cifras: 10-20, 10-33, 20-15.
- NO inventes contenido ni completes frases. Lo que no se entiende: [inaudible]. Si una versión es un invento sobre ruido (frases sin sentido en una radio de bomberos, cuentas "5, 4, 3, 2, 1"), descártala.
- Escribe con puntuación y mayúsculas normales para que se lea rápido: "Central, 10-10, médica 28.", "Jirón Colón 542, Miraflores." Sin palabras repetidas por eco del audio.
- Estilo de radio, breve, sin explicaciones. Texto vacío si no hubo habla real.
Claves: ${CLAVES_TXT}`,
    usuario: `Emergencias en curso:\n${ctx || "(ninguna)"}\n\nLo dicho antes en este canal: ${previo || "(nada)"}\n\nTransmisiones del canal ${piezas[0].tx.canal}, en orden:\n${JSON.stringify(items)}`,
  });
  const m = new Map<string, string>();
  for (const t of r.transmisiones) {
    const p = piezas[Number(t.id) - 1];
    if (p) m.set(p.tx.id, t.texto.replace(/\s+/g, " ").trim());
  }
  return m;
}

// ── Bucle ──────────────────────────────────────────────────────────────────
let corriendo = false;
let iniciado = false;

export function iniciarRefinador(almacen: Almacen) {
  if (iniciado) return;
  iniciado = true;
  console.log(`[refinado] segunda pasada activa (${MODELO_WHISPER} con contexto + ${MODELO_LLM})`);
  setInterval(() => void ciclo(almacen), 30_000);
  setInterval(limpiarAudios, 15 * 60_000);
}

async function ciclo(almacen: Almacen) {
  if (corriendo) return;
  corriendo = true;
  try {
    const ahora = Date.now();
    const lista = almacen.lista();
    const pendientes = lista.filter((t) => !t.refinado && ahora - new Date(t.ini).getTime() < 3 * 3600_000);
    const porCanal = new Map<string, Transmision[]>();
    for (const t of pendientes) porCanal.set(t.canal, [...(porCanal.get(t.canal) ?? []), t]);

    for (const [canal, txs] of porCanal) {
      // Conversaciones: transmisiones seguidas del mismo canal con huecos cortos
      const grupos: Transmision[][] = [];
      for (const t of txs) {
        const g = grupos[grupos.length - 1];
        const ult = g?.[g.length - 1];
        if (ult && (new Date(t.ini).getTime() - new Date(ult.fin).getTime()) / 1000 <= HUECO_S) g.push(t);
        else grupos.push([t]);
      }
      const ultimaDelCanal = lista.filter((x) => x.canal === canal).at(-1);
      for (const g of grupos) {
        const fin = new Date(g[g.length - 1].fin).getTime();
        // Si el canal sigue hablando, esperar a que la conversación termine
        if (ultimaDelCanal?.id === g[g.length - 1].id && (ahora - fin) / 1000 < FIN_CONVERSACION_S) continue;
        await refinarConversacion(almacen, g);
      }
    }
  } catch (err) {
    console.error("[refinado]", (err as Error).message);
  } finally {
    corriendo = false;
  }
}

async function refinarConversacion(almacen: Almacen, grupo: Transmision[]) {
  const piezas: Pieza[] = [];
  let t = 0;
  for (const tx of grupo) {
    let audio: Buffer;
    try {
      audio = fs.readFileSync(rutaAudio(tx.id));
    } catch {
      // Sin audio guardado (transmisión anterior a esta función): queda como está
      almacen.reemplazar({ ...tx, refinado: true });
      continue;
    }
    const d = duracionMp3(audio);
    if (t + d > MAX_AUDIO_S && piezas.length) break; // el resto va en el próximo ciclo
    piezas.push({ tx, audio, desde: t, hasta: t + d });
    t += d;
  }
  if (!piezas.length) return;

  const ini = new Date(piezas[0].tx.ini).getTime();
  const emergencias = emergenciasDeContexto(ini);
  const previo = almacen
    .lista()
    .filter((x) => x.canal === piezas[0].tx.canal && x.refinado && x.textoRapido != null)
    .filter((x) => new Date(x.ini).getTime() < ini && ini - new Date(x.ini).getTime() < 10 * 60_000)
    .slice(-4)
    .map((x) => x.texto)
    .join(" ")
    .slice(-400);

  let segunda = new Map<string, string>();
  try {
    segunda = await retranscribir(piezas, promptWhisper(emergencias, previo));
  } catch (err) {
    registrarErrorIA(err);
    if ((err as { status?: number }).status === 429) return; // reintenta en el próximo ciclo
  }
  let final = new Map<string, string>();
  try {
    final = await corregir(piezas, segunda, emergencias, previo);
  } catch (err) {
    registrarErrorIA(err);
    if ((err as { status?: number }).status === 429 && segunda.size === 0) return;
  }

  const snapshot = getMonitor().snapshot().emergencias;
  let cambios = 0;
  for (const p of piezas) {
    const actual = almacen.lista().find((x) => x.id === p.tx.id) ?? p.tx;
    const rapido = actual.textoRapido ?? actual.texto;
    const texto = final.get(p.tx.id) ?? (segunda.get(p.tx.id) || rapido);
    if (texto !== rapido) cambios++;
    const unidades = extraerUnidades(texto);
    const porCodigo = vincularPorCodigo(unidades, snapshot);
    almacen.reemplazar({
      ...actual,
      texto,
      textoRapido: rapido,
      refinado: true,
      unidades: unidades.length ? unidades : actual.unidades,
      partes: [...new Set([...actual.partes, ...porCodigo])],
      vinculo: actual.vinculo ?? (porCodigo.length ? "codigo" : null),
    });
  }
  console.log(`[refinado] ${piezas[0].tx.canal}: ${piezas.length} transmisión(es), ${Math.round(t)} s de audio, ${cambios} corregida(s)`);
}
