import type { Emergencia } from "@/lib/types";

/** Clave comparable de un código de unidad: "AMB 138-2" y "AMB138-2" → "AMB1382". */
export const canon = (codigo: string) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");

const PALABRAS: [RegExp, string][] = [
  [/\bRESCATE LIGERO\b/g, "RESLIG"],
  [/\bMAQUINA\b/g, "M"],
  [/\bAMBULANCIA\b/g, "AMB"],
  [/\bRESCATE\b/g, "RES"],
  [/\bCISTERNA\b/g, "CIST"],
  [/\bESCALA\b/g, "ESC"],
  [/\bMEDIC[OA]\b/g, "MED"],
];

const PREFIJOS = "RESLIG|MATPEL|CIST|AMB|RES|ESC|MED|PLT|MAT|M";
const RE_UNIDAD = new RegExp(`\\b(${PREFIJOS})[\\s.-]*(\\d{1,3})(?:[\\s.-]+(\\d{1,2})(?!\\d))?`, "g");

/** Códigos de unidad mencionados en una transcripción ("Ambulancia 138-2" → "AMB138-2"). */
export function extraerUnidades(texto: string): string[] {
  let t = texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [re, abrev] of PALABRAS) t = t.replace(re, abrev);
  const out = new Set<string>();
  for (const m of t.matchAll(RE_UNIDAD)) out.add(m[3] ? `${m[1]}${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`);
  return [...out];
}

/** Emergencias recientes cuyas unidades despachadas coinciden con las mencionadas. */
export function vincularPorCodigo(unidades: string[], emergencias: Emergencia[], ahora = Date.now()): string[] {
  if (!unidades.length) return [];
  const recientes = emergencias
    .filter((e) => ahora - new Date(e.fecha).getTime() < 6 * 3600_000)
    // Si una unidad figura en varias emergencias, corresponde la activa y más reciente
    .sort((a, b) => Number(b.activa) - Number(a.activa) || b.fecha.localeCompare(a.fecha));
  const partes = new Set<string>();
  for (const u of unidades) {
    const e = recientes.find((x) => x.maquinas.some((m) => canon(m) === canon(u)));
    if (e) partes.add(e.parte);
  }
  return [...partes];
}
