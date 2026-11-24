/**
 * Compañías de la IV Comandancia Departamental Lima Centro (IV CDLC): son las que la Central del
 * Canal 2 llama por selectiva. Fuente: radio.lenznetwork.com (listado de compañías de la IV CDLC).
 */
export interface Estacion {
  cia: string;
  nombre: string;
  distrito: string;
}

export const ESTACIONES_IV_CDLC: Estacion[] = [
  { cia: "B-2", nombre: "Roma", distrito: "Cercado de Lima" },
  { cia: "B-3", nombre: "France", distrito: "Cercado de Lima" },
  { cia: "B-4", nombre: "Lima", distrito: "Lince" },
  { cia: "B-8", nombre: "BFB Victoria", distrito: "La Victoria" },
  { cia: "B-10", nombre: "Salvadora Lima", distrito: "Cercado de Lima" },
  { cia: "B-11", nombre: "Cosmopolita", distrito: "San Borja" },
  { cia: "B-14", nombre: "Internacional", distrito: "Breña" },
  { cia: "B-21", nombre: "Rímac", distrito: "Rímac" },
  { cia: "B-36", nombre: "Magdalena", distrito: "Pueblo Libre" },
  { cia: "B-83", nombre: "San Miguel", distrito: "San Miguel" },
  { cia: "B-121", nombre: "San Juan de Lurigancho", distrito: "San Juan de Lurigancho" },
  { cia: "B-127", nombre: "Salamanca", distrito: "Ate" },
  { cia: "B-138", nombre: "Santa Anita (Carlos León Delgado)", distrito: "Santa Anita" },
  { cia: "B-202", nombre: "Jesús María", distrito: "Jesús María" },
];

const POR_CIA = new Map(ESTACIONES_IV_CDLC.map((e) => [e.cia, e]));
export const estacion = (cia: string | null | undefined) => (cia ? POR_CIA.get(cia) ?? null : null);
export const ciaDeNumero = (n: number) => `B-${n}`;

/**
 * Pares de tonos (Quick Call II) confirmados. Semilla tomada de las selectivas que el detector de
 * radio.lenznetwork.com marca como "confirmado". Si conoces más pares con certeza, agrégalos aquí:
 * tienen prioridad sobre lo que el sistema infiere por correlación.
 */
/**
 * El par de tonos CODIFICA el número de la compañía, dígito por dígito (verificado 12/12 contra los
 * pares confirmados y contra las máquinas que la Central nombra justo después de cada selectiva):
 *  - B-1 … B-99   → grupo 2: "2-(15+decena)/2-(15+unidad)"   p. ej. B-83 = 2-23/2-18
 *  - B-100 … B-199 → grupo 1: "1-(11+decena)/1-(1+unidad)"   p. ej. B-150 = 1-16/1-1
 * Devuelve null si el par no sigue el esquema (otro grupo o tono fuera de rango).
 */
export function ciaDePar(par: string): string | null {
  const m = par.match(/^(\d)-(\d+)\/(\d)-(\d+)$/);
  if (!m || m[1] !== m[3]) return null;
  const grupo = Number(m[1]);
  const t1 = Number(m[2]);
  const t2 = Number(m[4]);
  const enRango = (d: number) => d >= 0 && d <= 9;
  if (grupo === 2) {
    const dec = t1 - 15;
    const uni = t2 - 15;
    if (!enRango(dec) || !enRango(uni) || dec * 10 + uni === 0) return null;
    return `B-${dec * 10 + uni}`;
  }
  if (grupo === 1) {
    const dec = t1 - 11;
    const uni = t2 - 1;
    if (!enRango(dec) || !enRango(uni)) return null;
    return `B-${100 + dec * 10 + uni}`;
  }
  return null;
}

/** Par de tonos de una compañía (inverso de ciaDePar). */
export function parDeCia(n: number): string | null {
  if (n >= 1 && n <= 99) return `2-${15 + Math.floor(n / 10)}/2-${15 + (n % 10)}`;
  if (n >= 100 && n <= 199) return `1-${11 + Math.floor((n - 100) / 10)}/1-${1 + (n % 10)}`;
  return null;
}

export const PARES_CONFIRMADOS: Record<string, string> = {
  "2-15/2-17": "B-2",
  "2-15/2-18": "B-3",
  "2-15/2-19": "B-4",
  "2-15/2-23": "B-8",
  "2-16/2-15": "B-10",
  "2-16/2-19": "B-14",
  "1-13/1-2": "B-121",
  "1-13/1-8": "B-127",
  "1-14/1-9": "B-138",
};
