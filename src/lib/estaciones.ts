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
