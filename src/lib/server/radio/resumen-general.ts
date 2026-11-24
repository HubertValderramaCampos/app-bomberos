import type { Transmision } from "@/lib/types";
import { cortoCanal } from "@/lib/canales";
import { completarJSON, CONTEXTO, MODELO_RAPIDO } from "../ia";
import { hayCupo } from "../presupuesto-ia";

/** Respaldo liviano con cuota propia en Groq, si el presupuesto diario ya no alcanza para el modelo grande. */
const MODELO_RESUMEN = process.env.OPENAI_MODEL_RESUMEN || "openai/gpt-oss-20b";
const palabrasDe = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
import { getMonitor } from "../monitor";
import { getTranscriptor } from "./transcriptor";

/**
 * Resumen de TODO lo que se habla por radio (no solo lo vinculado a una emergencia):
 * puntos cortos, uno por emergencia/tema, de los últimos 45 min. Se regenera solo si hubo
 * conversación nueva suficiente, como máximo cada 2 min.
 */

export interface PuntoRadio {
  lugar: string;
  tipo: string;
  estado: string;
  detalle: string;
  parte: string | null;
  hora: string;
}

export interface ResumenGeneral {
  puntos: PuntoRadio[];
  generado: string;
  transmisiones: number;
}

const VENTANA_MS = 45 * 60_000;
const MIN_PALABRAS_NUEVAS = 25;
const MIN_ESPERA_MS = 4 * 60_000;
/** Más viejo que esto ya no se muestra mientras se genera el nuevo: se espera el nuevo. */
const MAX_VIGENCIA_MS = 6 * 60_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["puntos"],
  properties: {
    puntos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lugar", "tipo", "estado", "detalle", "parte", "hora"],
        properties: {
          lugar: { type: "string", description: "Dirección corta + distrito, p. ej. 'Av. Villa del Mar · Villa El Salvador'. Vacío si no se sabe." },
          tipo: { type: "string", description: "1-3 palabras: 'Incendio', 'Rescate', 'Emerg. médica', 'Accidente'..." },
          estado: { type: "string", description: "1-3 palabras: 'Despachada', 'En escena', 'Controlado', 'Pide apoyo', 'Retirándose'..." },
          detalle: { type: "string", description: "Máximo 14 palabras, estilo radio: unidades y lo último relevante. Sin explicar claves." },
          parte: { type: ["string", "null"], description: "Número de parte del SGO si coincide con certeza, si no null." },
          hora: { type: "string", description: "Hora HH:MM de la última transmisión del tema." },
        },
      },
    },
  },
} as const;

const g = globalThis as unknown as { __resumenRadio116?: { cache: ResumenGeneral | null; palabras: number; enCurso: Promise<ResumenGeneral | null> | null } };
const st = (g.__resumenRadio116 ??= { cache: null, palabras: 0, enCurso: null });

const hm = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false, hour: "2-digit", minute: "2-digit" });

async function generar(txs: Transmision[]): Promise<ResumenGeneral | null> {
  const activas = getMonitor()
    .snapshot()
    .emergencias.filter((e) => e.activa)
    .slice(0, 30)
    .map((e) => `#${e.parte} ${e.tipoPrincipal} | ${e.direccion}, ${e.distrito} | ${e.maquinas.join(",")}`);
  // Modelo grande (entiende mejor la radio) mientras haya cupo; si no, el liviano con cuota aparte
  const grande = hayCupo("media");
  const r = await completarJSON<{ puntos: PuntoRadio[] }>({
    modelo: grande ? MODELO_RAPIDO : MODELO_RESUMEN,
    esfuerzo: "low",
    nombre: "resumen_radio_general",
    prioridad: "media",
    presupuesto: grande,
    schema: SCHEMA,
    sistema: `${CONTEXTO}
Resumes la radio de la Central (transcripción automática con errores) para bomberos que ya conocen el oficio.
Agrupa TODO lo dicho sobre una misma emergencia en UN solo punto (mismas unidades, lugar o conversación seguida).
Usa la lista del SGO para completar lugar, tipo y parte cuando las unidades o el lugar coinciden.
Incluye un punto solo si tiene lugar o unidades concretas y algo operativo (despacho, llegada, pedido de apoyo,
control, víctimas, riesgo). Descarta confirmaciones sueltas, pruebas de radio, saludos y frases ininteligibles.
Máximo 5 puntos, el más reciente primero. Estilo telegráfico, sin explicar claves. Corrige errores obvios de transcripción. No inventes.`,
    usuario: `EMERGENCIAS ACTIVAS (SGO):\n${activas.join("\n") || "-"}\n\nRADIO (últimos 45 min):\n${txs
      .map((t) => `[${hm(t.ini)}] ${cortoCanal(t.canal)}: ${t.texto}`)
      .join("\n")}`,
  });
  const validos = new Set(getMonitor().snapshot().emergencias.map((e) => e.parte));
  return {
    puntos: r.puntos
      .filter((p) => p.lugar || p.parte || /d/.test(p.detalle))
      .sort((a, b) => b.hora.localeCompare(a.hora))
      .slice(0, 5)
      .map((p) => ({ ...p, parte: p.parte && validos.has(p.parte) ? p.parte : null })),
    generado: new Date().toISOString(),
    transmisiones: txs.length,
  };
}

export async function obtenerResumenGeneral(): Promise<ResumenGeneral | null> {
  const desde = Date.now() - VENTANA_MS;
  const txs = getTranscriptor()
    .lista()
    .filter((t) => Date.parse(t.ini) >= desde && palabrasDe(t.texto) >= 2)
    .slice(-80);
  if (!txs.length) return st.cache;
  const palabras = txs.reduce((n, t) => n + palabrasDe(t.texto), 0);
  const reciente = st.cache && Date.now() - Date.parse(st.cache.generado) < MIN_ESPERA_MS;
  const pocoNuevo = st.cache && Math.abs(palabras - st.palabras) < MIN_PALABRAS_NUEVAS;
  if (st.cache && (reciente || pocoNuevo)) return st.cache;
  if (st.enCurso) {
    const vigente = st.cache && Date.now() - Date.parse(st.cache.generado) < MAX_VIGENCIA_MS;
    return vigente ? st.cache : await st.enCurso;
  }
  st.enCurso = generar(txs)
    .then((r) => {
      if (r) {
        st.cache = r;
        st.palabras = palabras;
      }
      return r;
    })
    .catch((e) => {
      console.error("[resumen-radio]", (e as Error).message);
      return st.cache;
    })
    .finally(() => {
      st.enCurso = null;
    });
  // Si lo guardado es reciente se muestra al instante; si está viejo, se espera el nuevo
  const vigente = st.cache && Date.now() - Date.parse(st.cache.generado) < MAX_VIGENCIA_MS;
  return vigente ? st.cache : await st.enCurso;
}
