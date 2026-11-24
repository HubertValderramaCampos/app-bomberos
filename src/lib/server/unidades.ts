/**
 * Estado en vivo de las unidades según el SGO interno ("Vehículos por Comandancia").
 * Lo lee el scraper con SU sesión de la intranet (el portal permite una sola por cuenta)
 * y lo expone en su HTTP interno; aquí solo se consulta ese JSON. Nunca se inicia sesión.
 */

export interface UnidadSgo {
  cd: string;
  cia: string;
  unidad: string;
  estado: "DISPONIBLE" | "NO_DISPONIBLE" | "EN_EMERGENCIA" | "TALLER";
}

interface EstadoUnidades {
  actualizado: string | null;
  ok: boolean;
  error: string | null;
  unidades: UnidadSgo[];
}

const URL_UNIDADES = process.env.UNIDADES_URL || "http://host.docker.internal:8085/unidades";
const INTERVALO_MS = 60_000;

const g = globalThis as unknown as { __unidades116?: { estado: EstadoUnidades; timer: NodeJS.Timeout | null } };
const st = (g.__unidades116 ??= { estado: { actualizado: null, ok: false, error: "sin datos aún", unidades: [] }, timer: null });

async function actualizar() {
  try {
    const r = await fetch(URL_UNIDADES, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const d = (await r.json()) as EstadoUnidades;
    if (Array.isArray(d.unidades)) st.estado = d;
  } catch (e) {
    st.estado = { ...st.estado, ok: false, error: `Scraper no disponible: ${(e as Error).message}` };
  }
}

export function iniciarUnidades() {
  if (st.timer || process.env.UNIDADES_DESACTIVADO === "1") return;
  void actualizar();
  st.timer = setInterval(() => void actualizar(), INTERVALO_MS);
  st.timer.unref?.();
}

export function estadoUnidades(): EstadoUnidades {
  return st.estado;
}

/** Normaliza un código de unidad para comparar ("M 150-1" ≈ "M150-1"). */
export const normUnidad = (u: string) => u.toUpperCase().replace(/[\s.]/g, "");

/** Unidades EN EMERGENCIA ahora mismo (códigos normalizados). */
export function unidadesEnEmergencia(): Set<string> {
  return new Set(st.estado.unidades.filter((u) => u.estado === "EN_EMERGENCIA").map((u) => normUnidad(u.unidad)));
}
