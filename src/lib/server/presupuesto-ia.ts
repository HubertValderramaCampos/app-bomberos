import { guardar, leer } from "./store";

/**
 * Presupuesto diario de tokens con prioridades ("semáforo").
 *
 * Cada tarea de IA tiene una prioridad. Las tareas de menor valor solo pueden gastar mientras el consumo del día
 * esté por debajo de su tope; así, en un día movido, lo último que se corta son los resúmenes de las
 * emergencias grandes y MatPel. Cuando una tarea no tiene cupo, se usa el respaldo local (guías sin IA).
 *
 *   baja    → hasta 40 % del presupuesto  (situación general, vincular radio sin código de unidad)
 *   media   → hasta 65 %                  (emergencias comunes)
 *   alta    → hasta 85 %                  (incendios, rescates, varias unidades, mucha radio)
 *   critica → hasta 100 %                 (MatPel, emergencias grandes o de la compañía propia)
 *
 * El consumo se cuenta con los tokens reales que devuelve la API (incluye el razonamiento del modelo).
 */
export type Prioridad = "baja" | "media" | "alta" | "critica";

const TOPE: Record<Prioridad, number> = { baja: 0.4, media: 0.65, alta: 0.85, critica: 1 };
const ORDEN: Prioridad[] = ["baja", "media", "alta", "critica"];

/** Por defecto queda por debajo del límite diario del plan gratuito de Groq para gpt-oss-120b. */
export const TOKENS_DIA = Number(process.env.IA_TOKENS_DIA) || 180_000;

interface Consumo {
  dia: string;
  tokens: number;
  llamadas: number;
  omitidas: Partial<Record<Prioridad, number>>;
}

const diaLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

function consumo(): Consumo {
  const c = leer<Consumo | null>("presupuesto_ia", null);
  const hoy = diaLima();
  if (c && c.dia === hoy) return c;
  if (c) console.log(`[ia] consumo del ${c.dia}: ${c.tokens} tokens en ${c.llamadas} llamadas; omitidas por presupuesto: ${JSON.stringify(c.omitidas)}`);
  return { dia: hoy, tokens: 0, llamadas: 0, omitidas: {} };
}

/** ¿Esta tarea puede usar la IA ahora? Si no, la cuenta como omitida. */
export function hayCupo(p: Prioridad): boolean {
  const c = consumo();
  if (c.tokens < TOKENS_DIA * TOPE[p]) return true;
  c.omitidas[p] = (c.omitidas[p] ?? 0) + 1;
  guardar("presupuesto_ia", c);
  return false;
}

export function registrarConsumo(tokens: number | undefined) {
  const c = consumo();
  const antes = c.tokens / TOKENS_DIA;
  c.tokens += tokens ?? 0;
  c.llamadas += 1;
  guardar("presupuesto_ia", c);
  // Aviso al cruzar cada tope: desde ahí, las tareas de esa prioridad usan el respaldo local
  for (const p of ORDEN) {
    if (antes < TOPE[p] && c.tokens / TOKENS_DIA >= TOPE[p]) {
      console.warn(`[ia] ${Math.round(TOPE[p] * 100)} % del presupuesto diario usado: tareas de prioridad "${p}" pasan a respaldo local`);
    }
  }
}

/** Sube un nivel (p. ej. cuando una persona abre el detalle: lo está pidiendo explícitamente). */
export function subir(p: Prioridad): Prioridad {
  return ORDEN[Math.min(ORDEN.indexOf(p) + 1, ORDEN.length - 1)];
}

export function estadoPresupuesto() {
  const c = consumo();
  return { dia: c.dia, tokens: c.tokens, limite: TOKENS_DIA, llamadas: c.llamadas, omitidas: c.omitidas };
}
