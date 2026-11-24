import type { Emergencia, Transmision } from "@/lib/types";
import { clasificar, companiaDeUnidad } from "@/lib/categorias";
import { completarJSON, MODELO_RAPIDO } from "../ia";
import { getMonitor } from "../monitor";
import { getSelectivas } from "./selectivas";
import { getTranscriptor } from "./transcriptor";

/**
 * Despachos detectados por radio: cuando la Central dice "Atención, máquina…, <tipo>, <dirección>",
 * se crea una emergencia PROVISIONAL al instante (≈3 min antes de que el SGO la publique).
 * La compañía sale exacta de la selectiva (par de tonos) que suena justo antes; el tipo y la
 * dirección los extrae la IA de la transcripción. El monitor la une con la del SGO cuando aparece.
 */

/** Frases candidatas: llamado de la Central con unidades. Filtro barato antes de usar IA. */
const PATRON_DESPACHO = /atenci[oó]n|at[ée]nci/i;
/** Muchos despachos no empiezan con "Atención" pero dicen una dirección */
const PATRON_DIRECCION = /cruce|avenida|av.|jir[oó]n|jr.|calle|pasaje|altura|cuadra|urbanizaci[oó]n|asentamiento|aa.?s?hh|mz.?|manzana|lote|carretera|panamericana/i;
const PATRON_UNIDAD = /m[aá]quina|ambulancia|\bamb\b|rescate|escala|cisterna|unidad/i;
/** Selectivas que cuentan para un despacho: desde 90 s antes hasta 20 s después del inicio de la voz. */
const VENTANA_SELECTIVA_ANTES_MS = 90_000;
const VENTANA_SELECTIVA_DESPUES_MS = 20_000;
/** Un mismo despacho se repite o se completa en frases seguidas: se agrupa si es en menos de esto. */
const VENTANA_AGRUPAR_MS = 4 * 60_000;

interface Extraccion {
  es_despacho: boolean;
  tipo: string;
  direccion: string;
  distrito: string;
  unidades: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_despacho", "tipo", "direccion", "distrito", "unidades"],
  properties: {
    es_despacho: { type: "boolean", description: "true solo si la Central está despachando unidades a una emergencia nueva" },
    tipo: { type: "string", description: "Tipo en MAYÚSCULAS al estilo SGO, p. ej. 'INCENDIO / ESTRUCTURAS' o 'EMERGENCIA MEDICA'. Vacío si no se dice." },
    direccion: { type: "string", description: "Calle, número o cruce tal como se dijo, corregido si es obvio. Vacío si no se dice." },
    distrito: { type: "string", description: "Distrito de Lima/Callao en MAYÚSCULAS sin tildes, p. ej. 'VILLA EL SALVADOR'. Vacío si no se dice." },
    unidades: { type: "array", items: { type: "string" }, description: "Códigos de unidad normalizados: 'M121-1', 'AMB-105', 'RES-2', 'ESC-3'." },
  },
};

const SISTEMA = `Analizas transcripciones automáticas (pueden tener errores) de la radio de la Central de Emergencias del CGBVP (Lima, Perú).
Un DESPACHO típico: "Atención, máquina 121, máquina 134-1, ambulancia 105, comisión de rescate e incendio. Avenida Villa del Mar cruce ruta E, Villa El Salvador".
Devuelve es_despacho=false si es otra cosa (confirmaciones "10-05", pedidos de unidades en curso, conversación).
Normaliza unidades: "máquina 134-1"→"M134-1", "máquina 61"→"M61-1"... solo si hay número; "ambulancia 105"→"AMB-105"; "rescate 2"→"RES-2".
No inventes: si un dato no se dice, déjalo vacío.`;

export function esCandidata(texto: string) {
  return (PATRON_DESPACHO.test(texto) || PATRON_DIRECCION.test(texto)) && PATRON_UNIDAD.test(texto) && texto.length >= 40;
}

const normDistrito = (d: string) =>
  d
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

class Despachos {
  private iniciado = false;

  iniciar() {
    if (this.iniciado) return;
    this.iniciado = true;
    getTranscriptor().on("transmision", (tx: Transmision) => {
      if (!esCandidata(tx.texto)) return;
      this.procesar(tx).catch((e) => console.error("[despachos]", (e as Error).message));
    });
    console.log("[despachos] escuchando despachos de la Central");
  }

  private async procesar(tx: Transmision) {
    const ini = Date.parse(tx.ini);
    const x = await completarJSON<Extraccion>({
      modelo: MODELO_RAPIDO,
      esfuerzo: "low",
      nombre: "despacho_radio",
      schema: SCHEMA,
      sistema: SISTEMA,
      usuario: tx.texto,
      // Es lo más urgente que hace la IA: avisar antes que el SGO
      prioridad: "critica",
    });
    if (!x.es_despacho || (!x.direccion && !x.distrito && !x.unidades.length)) return;

    // Compañía exacta por selectiva (par de tonos decodificado)
    const selectivas = getSelectivas()
      .recientes(60)
      .filter((s) => s.cia && s.epoch * 1000 >= ini - VENTANA_SELECTIVA_ANTES_MS && s.epoch * 1000 <= ini + VENTANA_SELECTIVA_DESPUES_MS)
      .map((s) => s.cia as string);

    const companias = [
      ...new Set([
        ...selectivas.map((c) => Number(c.replace(/\D/g, ""))),
        ...x.unidades.map((u) => companiaDeUnidad(u)).filter((n): n is number => n != null),
      ]),
    ];

    const tipo = (x.tipo || "DESPACHO POR RADIO").toUpperCase();
    const [tipoPrincipal, ...resto] = tipo.split("/").map((s) => s.trim());
    const monitor = getMonitor();

    // ¿Es la continuación de un despacho reciente (mismo lugar o mismas unidades)? Entonces se completa.
    const previa = monitor
      .provisionales()
      .find(
        (p) =>
          ini - Date.parse(p.fecha) < VENTANA_AGRUPAR_MS &&
          ((x.distrito && normDistrito(p.distrito) === normDistrito(x.distrito)) || x.unidades.some((u) => p.maquinas.includes(u))),
      );

    const e: Emergencia = {
      parte: previa?.parte ?? `R${Math.floor(ini / 1000)}`,
      fecha: previa?.fecha ?? new Date(ini).toISOString(),
      direccion: x.direccion || previa?.direccion || "",
      distrito: normDistrito(x.distrito) || previa?.distrito || "",
      lat: null,
      lng: null,
      tipo,
      tipoPrincipal: tipoPrincipal || "DESPACHO POR RADIO",
      subtipo: resto.join(" / "),
      categoria: clasificar(tipo),
      estado: "DESPACHO RADIO",
      activa: true,
      maquinas: [...new Set([...(previa?.maquinas ?? []), ...x.unidades])],
      companias: [...new Set([...(previa?.companias ?? []), ...companias])],
      vistaEn: previa?.vistaEn ?? new Date().toISOString(),
      fuente: "radio",
      radio: {
        texto: previa ? `${previa.radio?.texto ?? ""}\n${tx.texto}`.trim() : tx.texto,
        selectivas: [...new Set([...(previa?.radio?.selectivas ?? []), ...selectivas])],
      },
    };
    monitor.agregarProvisional(e, !previa);
    console.log(`[despachos] ${previa ? "actualizado" : "NUEVO"} ${e.parte}: ${e.tipoPrincipal} · ${e.direccion} · ${e.distrito} · ${e.maquinas.join(",")} · selectivas ${selectivas.join(",") || "-"}`);
  }
}

const g = globalThis as unknown as { __despachos116?: Despachos };
export function getDespachos(): Despachos {
  return (g.__despachos116 ??= new Despachos());
}
