export type Categoria =
  | "incendio"
  | "medica"
  | "rescate"
  | "vehicular"
  | "matpel"
  | "servicio"
  | "otro";

export interface Emergencia {
  /** Número de parte del SGO, p. ej. "2026039235" */
  parte: string;
  /** Fecha/hora de despacho en ISO 8601 con offset de Perú (-05:00) */
  fecha: string;
  /** Calle + número, sin coordenadas ni distrito */
  direccion: string;
  distrito: string;
  lat: number | null;
  lng: number | null;
  /** Tipo completo tal como lo publica el SGO */
  tipo: string;
  /** Primer segmento del tipo, p. ej. "INCENDIO" */
  tipoPrincipal: string;
  /** Resto del tipo, p. ej. "ESTRUCTURAS / VIVIENDA" */
  subtipo: string;
  categoria: Categoria;
  /** "ATENDIENDO" | "CERRADO" | otro texto del SGO */
  estado: string;
  activa: boolean;
  /** Códigos de unidades despachadas, p. ej. ["M150-1", "AMB-150"] */
  maquinas: string[];
  /** Números de compañía inferidos de los códigos de unidades */
  companias: number[];
  /** Cuándo la vio por primera vez este servidor (ISO) */
  vistaEn: string;
}

export interface Snapshot {
  actualizado: string | null;
  ok: boolean;
  error: string | null;
  emergencias: Emergencia[];
}

export interface UnidadResumen {
  codigo: string;
  tipo: string;
  cantidad: number;
}

export interface Briefing {
  resumen: string;
  nivel: "alto" | "medio" | "bajo";
  situacion: string;
  riesgos: string[];
  seguridad: string[];
  acciones: string[];
  recursos: string[];
  verificar: string[];
  matpel: { posible: boolean; nota: string };
  /** true si se generó con reglas locales porque la IA no estaba disponible */
  local?: boolean;
  generado: string;
}

export interface Situacion {
  titular: string;
  nivel: "normal" | "elevado" | "critico";
  puntos: string[];
  destacadas: { parte: string; motivo: string }[];
  local?: boolean;
  generado: string;
}

export interface MatpelResultado {
  identificado: boolean;
  confianza: "alta" | "media" | "baja";
  nombre: string | null;
  sinonimos: string[];
  numero_onu: string | null;
  clase: string | null;
  guia_gre: string | null;
  nfpa: {
    salud: number | null;
    inflamabilidad: number | null;
    reactividad: number | null;
    especial: string | null;
  };
  descripcion: string;
  riesgos_incendio: string[];
  riesgos_salud: string[];
  epp: string[];
  aislamiento: string[];
  control_incendio: string[];
  derrame_fuga: string[];
  primeros_auxilios: string[];
  incompatibilidades: string[];
  observaciones_imagen: string | null;
  advertencias: string[];
  /** Coincidencia con la tabla local de referencia rápida */
  referencia_local?: { onu: string; nombre: string; guia: string; clase: string } | null;
}

/** Una transmisión de radio transcrita (puede agrupar un intercambio Central ↔ unidad). */
export interface Transmision {
  id: string;
  /** Receptor/canal, p. ej. "C-2" (Central) */
  canal: string;
  ini: string;
  fin: string;
  /** Segundos con portadora activa */
  duracion: number;
  texto: string;
  /** Códigos de unidad reconocidos en el texto, p. ej. ["AMB138-2"] */
  unidades: string[];
  /** Emergencias (partes) a las que se vinculó */
  partes: string[];
  vinculo: "codigo" | "ia" | null;
}

export interface ResumenRadio {
  resumen: string;
  estado_actual: string;
  cronologia: { hora: string; evento: string }[];
  solicitudes: string[];
  alertas: string[];
  transmisiones: number;
  generado: string;
}

export interface PrefsAlertas {
  lat: number | null;
  lng: number | null;
  /** Si true, el cliente actualiza lat/lng con el GPS cada vez que abre la app */
  seguirUbicacion: boolean;
  radioKm: number;
  categorias: Categoria[];
  /** Número de compañía, p. ej. 150 para B-150 */
  compania: number | null;
  sonido: boolean;
  vibracion: boolean;
}

export const PREFS_DEFAULT: PrefsAlertas = {
  lat: null,
  lng: null,
  seguirUbicacion: true,
  radioKm: 5,
  categorias: ["incendio", "rescate", "vehicular", "matpel", "medica"],
  compania: null,
  sonido: true,
  vibracion: true,
};
