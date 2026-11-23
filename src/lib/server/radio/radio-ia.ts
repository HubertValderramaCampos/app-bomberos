import type { Emergencia, ResumenRadio, SelectivaInfo, Transmision } from "@/lib/types";
import { horaLima } from "@/lib/tiempo";
import { completarJSON, CONTEXTO, MODELO_RAPIDO } from "../ia";
import { glosarioClaves } from "@/lib/claves";
import { cortoCanal } from "@/lib/canales";
import { contarPalabras, importancia, PALABRAS_ALERTA } from "../importancia";

/** Contexto de canales para la IA: cada línea de radio lleva su canal (C1–C4). */
const CANALES_IA = `CANALES: C2 = Central de Emergencias (despacho a compañías, selectivas). C1 y C4 = operaciones entre
unidades y estaciones en la escena. C3 = cobertura local (cerca de la Central / Jesús María). Lo que se dice en C1/C3/C4
suele continuar una emergencia ya despachada por C2.`;

const CLAVES_RADIO = `CLAVES DE RADIO DEL CGBVP (se pronuncian "diez treinta y tres" = 10-33; la transcripción puede escribir
"10-4" por 10-04). Úsalas para interpretar, citando la clave con su significado, p. ej. "10-33 (emergencia controlada)".
Cita una clave SOLO si su número aparece en la transcripción; no conviertas palabras sueltas ("siga", "conforme") en claves:
${glosarioClaves()}`;

const hms = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour12: false });

const lineaEmergencia = (e: Emergencia) =>
  `#${e.parte} ${horaLima(e.fecha)} | ${e.tipo} | ${e.direccion || "?"}, ${e.distrito || "?"} | unidades: ${e.maquinas.join(", ") || "ninguna aún"} | ${e.estado}`;

// ── Vinculación de transmisiones sin código de unidad ───────────────────────

const SCHEMA_VINCULOS = {
  type: "object",
  additionalProperties: false,
  required: ["vinculos"],
  properties: {
    vinculos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "parte"],
        properties: {
          id: { type: "string" },
          parte: { type: ["string", "null"], description: "Número de parte (solo dígitos) o null si no hay certeza." },
        },
      },
    },
  },
} as const;

/**
 * Asigna transmisiones a emergencias usando dirección, distrito, tipo, unidades y el contexto
 * de la conversación. Devuelve { idTransmision: parte | null }.
 */
export async function vincularConIA(
  pendientes: Transmision[],
  contexto: Transmision[],
  emergencias: Emergencia[],
): Promise<Record<string, string | null>> {
  if (!pendientes.length || !emergencias.length) return {};
  const validos = new Set(emergencias.map((e) => e.parte));
  const r = await completarJSON<{ vinculos: { id: string; parte: string | null }[] }>({
    modelo: MODELO_RAPIDO,
    esfuerzo: "low",
    nombre: "vinculos_radio",
    prioridad: "baja",
    schema: SCHEMA_VINCULOS,
    sistema: `${CONTEXTO}
Relacionas transmisiones de la radio de la Central de Emergencias (transcritas automáticamente, pueden tener errores)
con las emergencias publicadas en el SGO. Vincula SOLO si hay evidencia: dirección o calle, distrito, unidad o compañía
mencionada, tipo de emergencia, o continuidad clara con una transmisión anterior ya vinculada. Las respuestas cortas
("conforme", "adelante") van con la conversación que continúan, si es evidente. Ante la duda, parte = null.
La Central suele despachar por radio ANTES de que la emergencia aparezca en el SGO. Las claves de identificación de
emergencias (serie 20) ayudan a reconocer el tipo.
${CANALES_IA}
${CLAVES_RADIO}`,
    usuario: [
      `EMERGENCIAS (SGO):\n${emergencias.map(lineaEmergencia).join("\n")}`,
      contexto.length
        ? `TRANSMISIONES ANTERIORES (contexto, ya procesadas):\n${contexto.map((t) => `[${hms(t.ini)}] ${cortoCanal(t.canal)} parte=${t.partes[0] ?? "-"} "${t.texto}"`).join("\n")}`
        : "",
      `TRANSMISIONES A VINCULAR:\n${pendientes.map((t) => `id=${t.id} [${hms(t.ini)}] ${cortoCanal(t.canal)} "${t.texto}"`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const out: Record<string, string | null> = {};
  for (const v of r.vinculos) {
    const parte = v.parte?.match(/\d{6,}/)?.[0] ?? null;
    out[v.id] = parte && validos.has(parte) ? parte : null;
  }
  return out;
}

// ── Resumen de lo comunicado por radio sobre una emergencia ─────────────────

const SCHEMA_RESUMEN = {
  type: "object",
  additionalProperties: false,
  required: ["resumen", "estado_actual", "cronologia", "solicitudes", "alertas"],
  properties: {
    resumen: { type: "string", description: "2 a 3 oraciones con lo esencial comunicado por radio." },
    estado_actual: { type: "string", description: "Último estado conocido (p. ej. 'controlada', 'en ataque', 'unidades retornando')." },
    cronologia: {
      type: "array",
      description: "Hitos en orden: despacho, arribo, informes, controlada, retorno.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hora", "evento"],
        properties: { hora: { type: "string", description: "HH:MM" }, evento: { type: "string" } },
      },
    },
    solicitudes: { type: "array", items: { type: "string" }, description: "Recursos o apoyos solicitados por radio." },
    alertas: { type: "array", items: { type: "string" }, description: "Víctimas, atrapados, MATPEL, riesgos para el personal. Vacío si no hubo." },
  },
} as const;

// ── Resumen por umbral de palabras ──────────────────────────────────────────
// No se gastan tokens por cada "conforme": se resume cuando hay sustancia y se actualiza cuando llega
// bastante información nueva. Una palabra de alerta (atrapados, colapso, MATPEL…) fuerza la actualización.
const MIN_PALABRAS = Number(process.env.RESUMEN_MIN_PALABRAS) || 40;
const NUEVAS_PALABRAS = Number(process.env.RESUMEN_NUEVAS_PALABRAS) || 50;
const MIN_ENTRE_RESUMENES_MS = 60_000;

const cacheResumen = new Map<string, { ids: Set<string>; palabras: number; t: number; data: ResumenRadio }>();

/** Estado del resumen de una emergencia, para mostrarlo sin gastar tokens. */
export function estadoResumen(txs: Transmision[]) {
  const palabras = contarPalabras(txs);
  return { palabras, minimo: MIN_PALABRAS, listo: palabras >= MIN_PALABRAS || txs.some((t) => PALABRAS_ALERTA.test(t.texto)) };
}

export async function resumirRadio(e: Emergencia, txs: Transmision[], selectivas: SelectivaInfo[] = []): Promise<ResumenRadio | null> {
  if (!txs.length) return null;
  const previo = cacheResumen.get(e.parte);
  const nuevas = previo ? txs.filter((t) => !previo.ids.has(t.id)) : txs;
  if (previo && !nuevas.length) return previo.data;

  const imp = importancia(e, txs);
  const alertaNueva = nuevas.some((t) => PALABRAS_ALERTA.test(t.texto));
  if (!previo) {
    // Primer resumen: solo cuando ya hay sustancia (o una alerta)
    if (imp.palabras < MIN_PALABRAS && !alertaNueva) return null;
  } else if (!alertaNueva) {
    // Actualización: con suficiente información nueva y sin repetir en menos de 1 min
    if (imp.palabras - previo.palabras < NUEVAS_PALABRAS) return previo.data;
    if (Date.now() - previo.t < MIN_ENTRE_RESUMENES_MS) return previo.data;
  }

  // Selectivas y transmisiones intercaladas en orden cronológico. En una actualización solo va lo nuevo
  // junto con el resumen anterior: menos tokens de entrada que reenviar toda la conversación.
  const desde = previo ? Math.min(...nuevas.map((t) => Date.parse(t.ini))) : 0;
  const lineas = [
    ...selectivas
      .filter((s) => s.epoch * 1000 >= desde)
      .map((s) => ({
        t: s.epoch * 1000,
        l: `[${hms(new Date(s.epoch * 1000).toISOString())}] SELECTIVA: la Central llama por tono a ${s.cia}${s.origen === "inferida" ? " (probable)" : ""}`,
      })),
    ...nuevas.map((t) => ({ t: Date.parse(t.ini), l: `[${hms(t.ini)}] ${cortoCanal(t.canal)} "${t.texto}"` })),
  ]
    .sort((a, b) => a.t - b.t)
    .map((x) => x.l);

  const anterior = previo
    ? `\n\nRESUMEN ANTERIOR (actualízalo con lo nuevo; conserva la cronología previa y agrega los eventos nuevos):\n${JSON.stringify(
        { resumen: previo.data.resumen, estado_actual: previo.data.estado_actual, cronologia: previo.data.cronologia, solicitudes: previo.data.solicitudes, alertas: previo.data.alertas },
      )}`
    : "";

  const r = await completarJSON<Omit<ResumenRadio, "transmisiones" | "generado">>({
    modelo: MODELO_RAPIDO,
    esfuerzo: "low",
    nombre: "resumen_radio",
    prioridad: imp.nivel,
    schema: SCHEMA_RESUMEN,
    sistema: `${CONTEXTO}
Resumes lo comunicado por radio (todos los canales) sobre UNA emergencia. Las transcripciones son automáticas y pueden
tener errores en números y nombres: no inventes lo que no se dijo y marca como "(no confirmado)" lo dudoso.
Interpreta las claves con el glosario; si un número no está en el glosario o no encaja, no lo interpretes.
${CANALES_IA}
${CLAVES_RADIO}`,
    usuario: `EMERGENCIA (SGO): ${lineaEmergencia(e)}${anterior}\n\n${previo ? "RADIO NUEVA" : "RADIO"} (hora de Lima):\n${lineas.join("\n")}`,
  });
  const data: ResumenRadio = { ...r, transmisiones: txs.length, generado: new Date().toISOString() };
  cacheResumen.set(e.parte, { ids: new Set(txs.map((t) => t.id)), palabras: imp.palabras, t: Date.now(), data });
  if (cacheResumen.size > 300) cacheResumen.delete(cacheResumen.keys().next().value!);
  return data;
}
