import type { Emergencia, Transmision } from "@/lib/types";
import type { Prioridad } from "./presupuesto-ia";

/**
 * Importancia de una emergencia (0–100), calculada sin IA con lo que ya sabemos:
 * tipo, cuántas unidades y compañías se despacharon, cuánto se habla de ella por radio,
 * si por radio aparecen palabras de alerta y si es de la compañía propia.
 * Decide la prioridad de sus tareas de IA en el presupuesto diario.
 */
const PESO_CATEGORIA: Record<Emergencia["categoria"], number> = {
  matpel: 35,
  incendio: 30,
  rescate: 25,
  vehicular: 15,
  medica: 5,
  servicio: 5,
  otro: 5,
};

/** Señales de que la emergencia escala o hay vidas en riesgo. */
export const PALABRAS_ALERTA =
  /atrapad|v[ií]ctima|herid|fallecid|cad[aá]ver|colaps|derrumb|explosi|segunda alarma|tercera alarma|matpel|fuga de|propagaci|solicit\w* apoyo|m[aá]s unidades/i;

const COMPANIA_PROPIA = Number(process.env.COMPANIA_PROPIA) || null;

export const contarPalabras = (txs: Transmision[]) =>
  txs.reduce((n, t) => n + t.texto.split(/\s+/).filter(Boolean).length, 0);

export function importancia(e: Emergencia, txs: Transmision[] = []) {
  const palabras = contarPalabras(txs);
  const alerta = txs.some((t) => PALABRAS_ALERTA.test(t.texto));
  const propia = COMPANIA_PROPIA !== null && e.companias.includes(COMPANIA_PROPIA);

  const puntos = Math.min(
    100,
    PESO_CATEGORIA[e.categoria] +
      Math.min(e.maquinas.length * 6, 30) + // 5+ unidades ya es una emergencia grande
      (e.companias.length >= 3 ? 10 : 0) +
      Math.min(Math.floor(palabras / 15), 15) + // mucha conversación por radio
      (alerta ? 20 : 0) +
      (propia ? 25 : 0),
  );
  const nivel: Prioridad = puntos >= 65 ? "critica" : puntos >= 40 ? "alta" : puntos >= 20 ? "media" : "baja";
  return { puntos, nivel, palabras, alerta };
}
