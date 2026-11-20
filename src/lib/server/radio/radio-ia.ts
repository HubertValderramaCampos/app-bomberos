import type { Emergencia, ResumenRadio, Transmision } from "@/lib/types";
import { horaLima } from "@/lib/tiempo";
import { completarJSON, CONTEXTO, MODELO_RAPIDO } from "../ia";
import { glosarioClaves } from "@/lib/claves";

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
    schema: SCHEMA_VINCULOS,
    sistema: `${CONTEXTO}
Relacionas transmisiones de la radio de la Central de Emergencias (transcritas automáticamente, pueden tener errores)
con las emergencias publicadas en el SGO. Vincula SOLO si hay evidencia: dirección o calle, distrito, unidad o compañía
mencionada, tipo de emergencia, o continuidad clara con una transmisión anterior ya vinculada. Las respuestas cortas
("conforme", "adelante") van con la conversación que continúan, si es evidente. Ante la duda, parte = null.
La Central suele despachar por radio ANTES de que la emergencia aparezca en el SGO. Las claves de identificación de
emergencias (serie 20) ayudan a reconocer el tipo.
${CLAVES_RADIO}`,
    usuario: [
      `EMERGENCIAS (SGO):\n${emergencias.map(lineaEmergencia).join("\n")}`,
      contexto.length
        ? `TRANSMISIONES ANTERIORES (contexto, ya procesadas):\n${contexto.map((t) => `[${hms(t.ini)}] parte=${t.partes[0] ?? "-"} "${t.texto}"`).join("\n")}`
        : "",
      `TRANSMISIONES A VINCULAR:\n${pendientes.map((t) => `id=${t.id} [${hms(t.ini)}] "${t.texto}"`).join("\n")}`,
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

const cacheResumen = new Map<string, { clave: string; t: number; data: ResumenRadio }>();

export async function resumirRadio(e: Emergencia, txs: Transmision[]): Promise<ResumenRadio | null> {
  if (!txs.length) return null;
  const clave = txs.map((t) => t.id).join(",");
  const c = cacheResumen.get(e.parte);
  if (c && (c.clave === clave || Date.now() - c.t < 20_000)) return c.data;

  const r = await completarJSON<Omit<ResumenRadio, "transmisiones" | "generado">>({
    modelo: MODELO_RAPIDO,
    esfuerzo: "low",
    nombre: "resumen_radio",
    schema: SCHEMA_RESUMEN,
    sistema: `${CONTEXTO}
Resumes lo comunicado por la radio de la Central sobre UNA emergencia. Las transcripciones son automáticas y pueden
tener errores en números y nombres: no inventes lo que no se dijo y marca como "(no confirmado)" lo dudoso.
Interpreta las claves con el glosario; si un número no está en el glosario o no encaja, no lo interpretes.
${CLAVES_RADIO}`,
    usuario: `EMERGENCIA (SGO): ${lineaEmergencia(e)}\n\nTRANSMISIONES (hora de Lima):\n${txs
      .map((t) => `[${hms(t.ini)}] "${t.texto}"`)
      .join("\n")}`,
  });
  const data: ResumenRadio = { ...r, transmisiones: txs.length, generado: new Date().toISOString() };
  cacheResumen.set(e.parte, { clave, t: Date.now(), data });
  if (cacheResumen.size > 300) cacheResumen.delete(cacheResumen.keys().next().value!);
  return data;
}
