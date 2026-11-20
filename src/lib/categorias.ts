import type { Categoria } from "./types";

export interface CategoriaInfo {
  id: Categoria;
  nombre: string;
  corto: string;
  color: string;
}

export const CATEGORIAS: Record<Categoria, CategoriaInfo> = {
  incendio: { id: "incendio", nombre: "Incendio", corto: "Incendio", color: "#ef4444" },
  medica: { id: "medica", nombre: "Emergencia médica", corto: "Médica", color: "#3b82f6" },
  rescate: { id: "rescate", nombre: "Rescate", corto: "Rescate", color: "#eab308" },
  vehicular: { id: "vehicular", nombre: "Accidente vehicular", corto: "Vehicular", color: "#f97316" },
  matpel: { id: "matpel", nombre: "Materiales peligrosos", corto: "MatPel", color: "#a855f7" },
  servicio: { id: "servicio", nombre: "Servicio especial", corto: "Servicio", color: "#22d3ee" },
  otro: { id: "otro", nombre: "Otro", corto: "Otro", color: "#94a3b8" },
};

export const ORDEN_CATEGORIAS: Categoria[] = [
  "incendio",
  "rescate",
  "vehicular",
  "matpel",
  "medica",
  "servicio",
  "otro",
];

export function clasificar(tipo: string): Categoria {
  const t = tipo
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (t.startsWith("INCENDIO")) return "incendio";
  if (t.startsWith("EMERGENCIA MEDICA")) return "medica";
  if (t.startsWith("RESCATE")) return "rescate";
  if (t.startsWith("ACCIDENTE VEHICULAR") || t.startsWith("ACCIDENTE DE TRANSITO")) return "vehicular";
  if (t.startsWith("MATERIALES PELIGROSOS") || t.includes("MATPEL") || t.includes("FUGA DE GAS"))
    return "matpel";
  if (t.startsWith("SERVICIO ESPECIAL")) return "servicio";
  return "otro";
}

/**
 * "M150-1" → 150, "AMB-150" → 150, "RES-2" → 2, "PLT-11" → 11.
 * El primer número del código corresponde a la compañía en la nomenclatura del CGBVP.
 */
export function companiaDeUnidad(codigo: string): number | null {
  const m = codigo.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
