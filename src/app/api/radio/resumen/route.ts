import { obtenerResumenGeneral } from "@/lib/server/radio/resumen-general";

export const dynamic = "force-dynamic";

/** Resumen corto de todo lo hablado por radio en los últimos 45 min. */
export async function GET() {
  const r = await obtenerResumenGeneral();
  return Response.json(r ?? { puntos: [], generado: null, transmisiones: 0 }, { headers: { "Cache-Control": "no-store" } });
}
