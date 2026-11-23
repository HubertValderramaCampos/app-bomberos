import OpenAI from "openai";
import type { Briefing, Emergencia, MatpelResultado, Situacion, UnidadResumen } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { buscarPorOnu, distanciasGre } from "@/lib/matpel-ref";
import { horaLima } from "@/lib/tiempo";
import { guardar, leer } from "./store";
import { estadoPresupuesto, hayCupo, registrarConsumo, subir, type Prioridad } from "./presupuesto-ia";
import { importancia } from "./importancia";

export const MODELO_RAPIDO = process.env.OPENAI_MODEL_RAPIDO || "gpt-5.4-mini";
// MatPel: gpt-5.4-mini identificó igual que gpt-5.4 en las pruebas (texto y foto) en ~6 s en vez de ~20 s.
// Las distancias críticas no dependen del modelo (ver GRE_DISTANCIAS).
const MODELO_EXPERTO = process.env.OPENAI_MODEL_EXPERTO || "gpt-5.4-mini";
// Proveedores compatibles con OpenAI (Groq, DeepSeek…) se configuran con OPENAI_BASE_URL, que el SDK lee solo.
// Si el modelo no acepta imágenes, IA_VISION=0 desactiva MatPel por foto (la consulta por texto sigue).
export const IA_VISION = process.env.IA_VISION !== "0";

export class FotoNoDisponible extends Error {}

export const CONTEXTO = `Apoyas a bomberos voluntarios del Cuerpo General de Bomberos Voluntarios del Perú (CGBVP).
Usa español del Perú y terminología del CGBVP: compañía (B-xxx), unidad/máquina, Central de Emergencias, al mando,
EPP, ERA (equipo de respiración autónoma), APH, GRE (Guía de Respuesta en caso de Emergencia), MATPEL.
Sé concreto y operativo: frases cortas, accionables, sin relleno. No inventes datos que no estén en la información;
si algo es incierto, indícalo como algo a verificar. La seguridad del personal es la prioridad.`;

// ── Cliente y control de disponibilidad ──────────────────────────────────────

const g = globalThis as unknown as {
  __openai?: OpenAI | null;
  __iaBloqueadaHasta?: number;
  __iaUltimoError?: string | null;
};

function cliente(): OpenAI | null {
  if (g.__openai !== undefined) return g.__openai;
  const key = process.env.OPENAI_API_KEY;
  g.__openai = key ? new OpenAI({ apiKey: key, timeout: 45_000, maxRetries: 1 }) : null;
  return g.__openai;
}

export function estadoIA() {
  const bloqueada = (g.__iaBloqueadaHasta ?? 0) > Date.now();
  return {
    configurada: !!process.env.OPENAI_API_KEY,
    disponible: !!cliente() && !bloqueada,
    ultimoError: g.__iaUltimoError ?? null,
    presupuesto: estadoPresupuesto(),
  };
}

class IANoDisponible extends Error {}

/** Cliente listo para usar, o IANoDisponible si no hay clave o la IA está en pausa. */
export function clienteIA(): OpenAI {
  const c = cliente();
  if (!c) throw new IANoDisponible("OPENAI_API_KEY no configurada");
  if ((g.__iaBloqueadaHasta ?? 0) > Date.now()) throw new IANoDisponible(g.__iaUltimoError ?? "IA en pausa");
  return c;
}

/** Registra un error de OpenAI; si es por saldo o clave, pausa la IA 10 min y lanza IANoDisponible. */
export function registrarErrorIA(err: unknown): never {
  const e = err as { status?: number; code?: string; message?: string };
  const msg = e.message ?? String(err);
  g.__iaUltimoError = msg;
  // Sin saldo o clave inválida: pausamos 10 min para no martillar la API en cada emergencia.
  if (e.status === 401 || e.code === "insufficient_quota" || /credits|quota/i.test(msg)) {
    g.__iaBloqueadaHasta = Date.now() + 10 * 60_000;
    console.warn("[ia] IA pausada 10 min:", msg);
    throw new IANoDisponible(msg);
  }
  // Límite por minuto/día del proveedor (p. ej. plan gratuito de Groq): pausa corta y respaldo local.
  if (e.status === 429 || /rate limit/i.test(msg)) {
    g.__iaBloqueadaHasta = Date.now() + 2 * 60_000;
    console.warn("[ia] límite del proveedor; IA pausada 2 min:", msg);
    throw new IANoDisponible(msg);
  }
  throw err;
}

export async function completarJSON<T>(opts: {
  modelo: string;
  esfuerzo?: "none" | "low" | "medium";
  nombre: string;
  schema: Record<string, unknown>;
  sistema: string;
  usuario: OpenAI.Chat.ChatCompletionContentPart[] | string;
  /** Prioridad en el presupuesto diario de tokens (ver presupuesto-ia.ts). */
  prioridad: Prioridad;
}): Promise<T> {
  const c = clienteIA();
  if (!hayCupo(opts.prioridad)) throw new IANoDisponible(`Presupuesto diario sin cupo para prioridad ${opts.prioridad}`);

  try {
    const r = await c.chat.completions.create({
      model: opts.modelo,
      reasoning_effort: opts.esfuerzo ?? "low",
      messages: [
        { role: "system", content: opts.sistema },
        { role: "user", content: opts.usuario },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.nombre, strict: true, schema: opts.schema },
      },
    });
    registrarConsumo(r.usage?.total_tokens);
    const txt = r.choices[0]?.message?.content;
    if (!txt) throw new Error("Respuesta vacía del modelo");
    g.__iaUltimoError = null;
    return JSON.parse(txt) as T;
  } catch (err) {
    registrarErrorIA(err);
  }
}

const str = { type: "string" } as const;
const arr = { type: "array", items: { type: "string" } } as const;
const nstr = { type: ["string", "null"] } as const;
const nint = { type: ["integer", "null"] } as const;

// ── Briefing por emergencia ──────────────────────────────────────────────────

const SCHEMA_BRIEFING = {
  type: "object",
  additionalProperties: false,
  required: ["resumen", "nivel", "situacion", "riesgos", "seguridad", "acciones", "recursos", "verificar", "matpel"],
  properties: {
    resumen: { type: "string", description: "Una línea (máx. 140 caracteres) para la notificación push." },
    nivel: { type: "string", enum: ["alto", "medio", "bajo"] },
    situacion: { type: "string", description: "2 a 3 oraciones: qué se espera encontrar." },
    riesgos: { ...arr, description: "3 a 5 riesgos probables para este tipo de emergencia y lugar." },
    seguridad: { ...arr, description: "3 a 5 medidas de seguridad para el personal." },
    acciones: { ...arr, description: "3 a 5 acciones iniciales sugeridas al llegar." },
    recursos: { ...arr, description: "0 a 3 recursos adicionales a considerar solicitar." },
    verificar: { ...arr, description: "2 a 4 datos a confirmar con la Central o en la escena." },
    matpel: {
      type: "object",
      additionalProperties: false,
      required: ["posible", "nota"],
      properties: { posible: { type: "boolean" }, nota: str },
    },
  },
} as const;

type BriefingCache = Record<string, Briefing & { clave: string }>;
const enCurso = new Map<string, Promise<Briefing>>();

function claveBriefing(e: Emergencia) {
  return `${e.tipo}|${e.maquinas.length}`;
}

export function briefingEnCache(parte: string): Briefing | null {
  return leer<BriefingCache>("briefings", {})[parte] ?? null;
}

/**
 * origen "push": se genera solo para avisar; las emergencias de importancia baja usan la guía local (sin tokens).
 * origen "detalle": alguien abrió la emergencia y lo está pidiendo; su prioridad sube un nivel.
 */
export async function obtenerBriefing(
  e: Emergencia,
  unidades: UnidadResumen[] = [],
  origen: "push" | "detalle" = "detalle",
): Promise<Briefing> {
  const cache = leer<BriefingCache>("briefings", {});
  const previo = cache[e.parte];
  if (previo && previo.clave === claveBriefing(e) && !previo.local) return previo;

  const { nivel } = importancia(e);
  if (origen === "push" && nivel === "baja") return briefingLocal(e);
  const prioridad = origen === "detalle" ? subir(nivel) : nivel;

  const pendiente = enCurso.get(e.parte);
  if (pendiente) return pendiente;

  const p = (async () => {
    let b: Briefing;
    try {
      const datos = [
        `Tipo: ${e.tipo}`,
        `Dirección: ${e.direccion || "sin dato"} — Distrito: ${e.distrito || "sin dato"}`,
        `Despacho: ${horaLima(e.fecha)} (hora de Lima) — Estado: ${e.estado}`,
        `Unidades despachadas: ${e.maquinas.join(", ") || "ninguna registrada aún"}`,
        unidades.length ? `Tipos de unidad: ${unidades.map((u) => `${u.cantidad}× ${u.tipo}`).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const r = await completarJSON<Omit<Briefing, "generado">>({
        modelo: MODELO_RAPIDO,
        esfuerzo: "low",
        nombre: "briefing_emergencia",
        prioridad,
        schema: SCHEMA_BRIEFING,
        sistema: `${CONTEXTO}\nGeneras un briefing operativo breve para el personal que se dirige o monitorea una emergencia.`,
        usuario: `Emergencia publicada por el SGO del CGBVP:\n${datos}`,
      });
      b = { ...r, generado: new Date().toISOString() };
    } catch (err) {
      if (!(err instanceof IANoDisponible)) console.error("[ia] briefing:", (err as Error).message);
      b = briefingLocal(e);
    }
    const c = leer<BriefingCache>("briefings", {});
    c[e.parte] = { ...b, clave: claveBriefing(e) };
    const claves = Object.keys(c);
    if (claves.length > 400) for (const k of claves.slice(0, claves.length - 400)) delete c[k];
    guardar("briefings", c);
    return b;
  })().finally(() => enCurso.delete(e.parte));

  enCurso.set(e.parte, p);
  return p;
}

const REGLAS: Record<string, Pick<Briefing, "riesgos" | "seguridad" | "acciones" | "verificar">> = {
  incendio: {
    riesgos: ["Humo tóxico y monóxido de carbono", "Colapso estructural", "Propagación a colindantes", "Posibles balones de GLP o energía eléctrica activa"],
    seguridad: ["EPP completo y ERA antes de ingresar", "Control de personal en la escena", "Ventilación coordinada con el ataque", "Cortar energía eléctrica y gas"],
    acciones: ["Dimensionar la escena (360°)", "Priorizar búsqueda y rescate de personas", "Establecer abastecimiento de agua", "Proteger exposiciones"],
    verificar: ["¿Personas atrapadas?", "Tipo de estructura y uso", "Presencia de GLP o materiales peligrosos"],
  },
  medica: {
    riesgos: ["Exposición a fluidos corporales", "Escena insegura (tránsito, agresión)", "Deterioro rápido del paciente"],
    seguridad: ["Bioseguridad: guantes, mascarilla y lentes", "Evaluar seguridad de la escena antes de ingresar"],
    acciones: ["Evaluación primaria XABCDE", "Control de hemorragias", "Inmovilización si hay mecanismo de trauma", "Coordinar traslado"],
    verificar: ["Número de pacientes", "Edad y estado de conciencia", "Mecanismo de lesión"],
  },
  vehicular: {
    riesgos: ["Tránsito vehicular activo", "Derrame de combustible", "Airbags sin activar", "Vehículo eléctrico o híbrido (alto voltaje)"],
    seguridad: ["Posicionar la unidad como bloqueo", "Señalizar con conos", "Estabilizar vehículos", "Línea de protección cargada si hay derrame"],
    acciones: ["Triaje de víctimas", "Desconectar batería", "Evaluar necesidad de extricación", "Coordinar con PNP el tránsito"],
    verificar: ["Número de vehículos y víctimas", "¿Personas atrapadas?", "Fuga de combustible o GLP/GNV"],
  },
  rescate: {
    riesgos: ["Inestabilidad del entorno", "Caída de altura", "Atrapamiento secundario del rescatista"],
    seguridad: ["Asegurar la zona antes de ingresar", "Equipo de protección contra caídas", "Designar oficial de seguridad"],
    acciones: ["Evaluar y estabilizar la escena", "Ubicar y contactar a la víctima", "Seleccionar técnica de rescate", "Preparar APH"],
    verificar: ["Tipo de rescate (altura, zanja, estructura, agua)", "Número de víctimas", "Accesos disponibles"],
  },
  matpel: {
    riesgos: ["Exposición tóxica por inhalación o contacto", "Incendio o explosión", "Contaminación ambiental"],
    seguridad: ["Aproximarse con viento a favor y desde terreno alto", "No ingresar sin identificar el material", "EPP nivel adecuado según la GRE"],
    acciones: ["Identificar el material (N° ONU, placa, HDS)", "Aislar el área y negar el ingreso", "Consultar la guía GRE correspondiente", "Establecer zonas caliente/tibia/fría"],
    verificar: ["N° ONU o nombre del producto", "Estado del contenedor (fuga, derrame, fuego)", "Personas expuestas"],
  },
  servicio: {
    riesgos: ["Riesgos propios del servicio solicitado"],
    seguridad: ["EPP acorde al servicio", "Evaluar la escena al llegar"],
    acciones: ["Confirmar el tipo de servicio con la Central", "Coordinar con el solicitante"],
    verificar: ["Naturaleza exacta del servicio", "Personas involucradas"],
  },
  otro: {
    riesgos: ["Escena no caracterizada"],
    seguridad: ["Evaluación de la escena antes de ingresar", "EPP completo"],
    acciones: ["Dimensionar la escena", "Informar a la Central"],
    verificar: ["Naturaleza de la emergencia", "Personas afectadas"],
  },
};

export function briefingLocal(e: Emergencia): Briefing {
  const r = REGLAS[e.categoria] ?? REGLAS.otro;
  const lugar = [e.direccion, e.distrito].filter(Boolean).join(", ");
  return {
    resumen: `${e.subtipo || e.tipoPrincipal}${lugar ? ` · ${lugar}` : ""}${e.maquinas.length ? ` · ${e.maquinas.join(", ")}` : ""}`.slice(0, 160),
    nivel: e.categoria === "incendio" || e.categoria === "matpel" ? "alto" : e.categoria === "servicio" ? "bajo" : "medio",
    situacion: `${CATEGORIAS[e.categoria].nombre}: ${e.subtipo || e.tipoPrincipal}${lugar ? ` en ${lugar}` : ""}. ${e.maquinas.length ? `Despachadas: ${e.maquinas.join(", ")}.` : "Unidades por confirmar."}`,
    ...r,
    recursos: [],
    matpel: {
      posible: e.categoria === "matpel" || /GAS|GLP|QUIMIC|COMBUSTIBLE/i.test(e.tipo),
      nota: e.categoria === "matpel" ? "Emergencia clasificada como MATPEL: identificar el material antes de actuar." : "",
    },
    local: true,
    generado: new Date().toISOString(),
  };
}

// ── Situación general ────────────────────────────────────────────────────────

const SCHEMA_SITUACION = {
  type: "object",
  additionalProperties: false,
  required: ["titular", "nivel", "puntos", "destacadas"],
  properties: {
    titular: { type: "string", description: "Una línea que resuma la situación operativa actual." },
    nivel: { type: "string", enum: ["normal", "elevado", "critico"] },
    puntos: { ...arr, description: "3 a 5 puntos clave: zonas con más actividad, incendios activos, MATPEL, carga de unidades." },
    destacadas: {
      type: "array",
      description: "0 a 3 emergencias que merecen atención especial.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["parte", "motivo"],
        properties: {
          parte: { type: "string", description: "SOLO el número de parte (dígitos), p. ej. 2026039236." },
          motivo: { type: "string", description: "Motivo breve (máx. 12 palabras)." },
        },
      },
    },
  },
} as const;

const SITUACION_MIN_MS = (Number(process.env.SITUACION_MIN_SEG) || 600) * 1000;
let situacionCache: { clave: string; t: number; data: Situacion } | null = null;
let situacionEnCurso: Promise<Situacion> | null = null;

export async function obtenerSituacion(emergencias: Emergencia[]): Promise<Situacion> {
  const activas = emergencias.filter((e) => e.activa);
  const clave = activas.map((e) => `${e.parte}:${e.maquinas.length}`).join(",");
  if (situacionCache) {
    // Mismas emergencias activas → mismo resumen. Si cambiaron, regeneramos como máximo cada 90 s.
    if (situacionCache.clave === clave) return situacionCache.data;
    // Es la tarea de menor valor: se regenera como máximo cada SITUACION_MIN_SEG (10 min por defecto).
    if (Date.now() - situacionCache.t < SITUACION_MIN_MS && !situacionCache.data.local) return situacionCache.data;
  }
  if (situacionEnCurso) return situacionEnCurso;

  situacionEnCurso = (async () => {
    let data: Situacion;
    if (activas.length === 0) {
      data = situacionLocal(emergencias);
    } else {
      try {
        const lineas = activas
          .slice(0, 60)
          .map((e) => `#${e.parte} ${horaLima(e.fecha)} | ${e.tipo} | ${e.distrito || "?"} | ${e.maquinas.length} unidades`)
          .join("\n");
        const cerradas = emergencias.length - activas.length;
        const r = await completarJSON<Omit<Situacion, "generado">>({
          modelo: MODELO_RAPIDO,
          esfuerzo: "low",
          nombre: "situacion_operativa",
          prioridad: "baja",
          schema: SCHEMA_SITUACION,
          sistema: `${CONTEXTO}\nResumes la situación operativa actual para un tablero de bomberos.`,
          usuario: `Hora actual (Lima): ${horaLima(new Date().toISOString())}.\nEmergencias ACTIVAS (${activas.length}); cerradas en 24 h: ${cerradas}.\n${lineas}`,
        });
        // El modelo a veces devuelve "#2026… – INCENDIO…": nos quedamos con el número y solo si existe.
        const validos = new Set(activas.map((e) => e.parte));
        const destacadas = r.destacadas
          .map((d) => ({ ...d, parte: d.parte.match(/\d{6,}/)?.[0] ?? "" }))
          .filter((d) => validos.has(d.parte));
        data = { ...r, destacadas, generado: new Date().toISOString() };
      } catch (err) {
        if (!(err instanceof IANoDisponible)) console.error("[ia] situación:", (err as Error).message);
        data = situacionLocal(emergencias);
      }
    }
    situacionCache = { clave, t: Date.now(), data };
    return data;
  })().finally(() => (situacionEnCurso = null));

  return situacionEnCurso;
}

export function situacionLocal(emergencias: Emergencia[]): Situacion {
  const activas = emergencias.filter((e) => e.activa);
  const porCat = new Map<string, number>();
  const porDistrito = new Map<string, number>();
  for (const e of activas) {
    porCat.set(e.categoria, (porCat.get(e.categoria) ?? 0) + 1);
    if (e.distrito) porDistrito.set(e.distrito, (porDistrito.get(e.distrito) ?? 0) + 1);
  }
  const incendios = activas.filter((e) => e.categoria === "incendio").length;
  const matpel = activas.filter((e) => e.categoria === "matpel").length;
  const topDistritos = [...porDistrito.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const puntos = [
    [...porCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${n} ${CATEGORIAS[c as keyof typeof CATEGORIAS].corto.toLowerCase()}`)
      .join(" · ") || "Sin emergencias activas",
    topDistritos.length ? `Mayor actividad: ${topDistritos.map(([d, n]) => `${d} (${n})`).join(", ")}` : "",
    incendios ? `${incendios} incendio(s) en curso` : "",
    matpel ? `${matpel} emergencia(s) MATPEL activa(s)` : "",
    `${activas.reduce((s, e) => s + e.maquinas.length, 0)} unidades comprometidas`,
  ].filter(Boolean);
  return {
    titular: activas.length ? `${activas.length} emergencias activas en este momento` : "Sin emergencias activas en este momento",
    nivel: incendios >= 4 || matpel >= 2 || activas.length >= 40 ? "elevado" : "normal",
    puntos,
    destacadas: [],
    local: true,
    generado: new Date().toISOString(),
  };
}

// ── Materiales peligrosos ────────────────────────────────────────────────────

const SCHEMA_MATPEL = {
  type: "object",
  additionalProperties: false,
  required: [
    "identificado", "confianza", "nombre", "sinonimos", "numero_onu", "clase", "guia_gre", "nfpa", "descripcion",
    "riesgos_incendio", "riesgos_salud", "epp", "aislamiento", "control_incendio", "derrame_fuga",
    "primeros_auxilios", "incompatibilidades", "observaciones_imagen", "advertencias",
  ],
  properties: {
    identificado: { type: "boolean" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    nombre: nstr,
    sinonimos: arr,
    numero_onu: { ...nstr, description: "Número ONU de 4 dígitos, sin prefijo." },
    clase: { ...nstr, description: "Clase/división de riesgo ONU, p. ej. '2.1 Gas inflamable'." },
    guia_gre: { ...nstr, description: "Número de guía de la GRE/ERG 2024, p. ej. '115' o '119P'." },
    nfpa: {
      type: "object",
      additionalProperties: false,
      required: ["salud", "inflamabilidad", "reactividad", "especial"],
      properties: { salud: nint, inflamabilidad: nint, reactividad: nint, especial: nstr },
    },
    descripcion: { type: "string", description: "1 a 2 oraciones: qué es y su peligro principal." },
    riesgos_incendio: arr,
    riesgos_salud: arr,
    epp: arr,
    aislamiento: { ...arr, description: "Distancias de aislamiento inicial y evacuación según la guía GRE." },
    control_incendio: arr,
    derrame_fuga: arr,
    primeros_auxilios: arr,
    incompatibilidades: arr,
    observaciones_imagen: { ...nstr, description: "Qué se ve en la imagen (placas, números, rombos, etiquetas). null si no hay imagen." },
    advertencias: { ...arr, description: "Advertencias críticas, p. ej. si es TIH (tabla 1 de páginas verdes)." },
  },
} as const;

const SISTEMA_MATPEL = `${CONTEXTO}
Eres técnico en materiales peligrosos (MATPEL). Identificas sustancias a partir del N° ONU, nombre, descripción,
placa/rombo, rombo NFPA 704, pictogramas SGA o etiquetas en fotos, y das la respuesta inicial según la GRE 2024 (ERG).
Reglas:
- Si la imagen o el texto no permiten identificar con certeza, pon identificado=false, explica qué se ve y qué
  información buscar (N° ONU en la placa naranja, HDS, guía de remisión); puedes dar la guía GRE de la clase si se ve la placa.
- Cada lista: 2 a 6 puntos cortos y accionables. Aislamiento: reproduce las distancias de la guía GRE tal como figuran
  ("precaución inmediata" e "incendio de tanque/cisterna"); si no estás seguro de una cifra, escribe "ver guía N" en vez de inventarla.
  Si la sustancia está en la tabla 1 (TIH/tóxica por inhalación) o reacciona con agua, adviértelo para consultar las páginas verdes.
- No inventes el N° ONU: si no lo sabes, null.`;

export async function identificarMatpel(consulta: string, imagenDataUrl?: string | null): Promise<MatpelResultado> {
  if (imagenDataUrl && !IA_VISION) {
    if (!consulta?.trim()) throw new FotoNoDisponible("La identificación por foto no está disponible");
    imagenDataUrl = null; // hay texto: se responde con eso
  }
  const partes: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: consulta?.trim()
        ? `Consulta del bombero: ${consulta.trim()}`
        : "Identifica el material peligroso en la imagen.",
    },
  ];
  if (imagenDataUrl) partes.push({ type: "image_url", image_url: { url: imagenDataUrl, detail: "high" } });

  const r = await completarJSON<MatpelResultado>({
    modelo: MODELO_EXPERTO,
    esfuerzo: (process.env.OPENAI_ESFUERZO_MATPEL as "none" | "low" | "medium") || "low",
    nombre: "identificacion_matpel",
    prioridad: "critica", // seguridad del personal: lo último que se corta
    schema: SCHEMA_MATPEL,
    sistema: SISTEMA_MATPEL,
    usuario: partes,
  });

  const ref = buscarPorOnu(r.numero_onu);
  if (ref) {
    if (r.guia_gre && r.guia_gre.toUpperCase() !== ref.guia.toUpperCase()) {
      r.advertencias = [
        `La IA indicó la guía ${r.guia_gre}, pero la tabla de referencia indica la guía ${ref.guia} para ONU ${ref.onu}. Se muestra la guía ${ref.guia}; verificar en la GRE.`,
        ...r.advertencias,
      ];
    }
    r.guia_gre = ref.guia;
    r.referencia_local = { onu: ref.onu, nombre: ref.nombre, guia: ref.guia, clase: ref.clase };
  } else {
    r.referencia_local = null;
  }

  // Distancias críticas: para las guías conocidas, las cifras salen de la tabla y no de la IA.
  const d = distanciasGre(r.guia_gre);
  if (d) {
    // Cualquier línea de la IA con una distancia de aislamiento/evacuación se descarta: manda la tabla.
    const esDistancia = (l: string) =>
      /\d[\d.,\s]*(m|metros|km)\b/i.test(l) && /(aisl|evac|precauci|incendi|fuego|radio|redonda)/i.test(l);
    r.aislamiento = [
      `Precaución inmediata: ${d.inicial.charAt(0).toLowerCase()}${d.inicial.slice(1)} (GRE guía ${r.guia_gre}).`,
      `Si un tanque, carro tanque o cisterna está involucrado en un incendio: aislar ${d.incendio} m en todas direcciones; considerar evacuación inicial en esa distancia.`,
      // También sobran las líneas "ver guía N" sobre precaución inicial o incendio: ya están arriba con la cifra.
      ...r.aislamiento.filter((l) => !esDistancia(l) && !(/(precauci|incendio|tanque)/i.test(l) && /(ver|consultar)[^.]{0,25}gu\S*a/i.test(l))),
    ];
  }
  return r;
}

export { IANoDisponible };
