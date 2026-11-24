import { getMonitor } from "@/lib/server/monitor";
import { getTranscriptor } from "@/lib/server/radio/transcriptor";
import { getSelectivas } from "@/lib/server/radio/selectivas";
import { estadoResumen, resumirRadio } from "@/lib/server/radio/radio-ia";
import { IANoDisponible } from "@/lib/server/ia";

export const dynamic = "force-dynamic";

/** Lo comunicado por radio sobre una emergencia: transmisiones vinculadas + resumen con IA. */
export async function GET(_req: Request, ctx: RouteContext<"/api/radio/emergencia/[parte]">) {
  const { parte } = await ctx.params;
  // Vinculación bajo demanda (máx. 1/min, el resultado queda para todos). Tope de espera para no trabar la pantalla.
  await Promise.race([getTranscriptor().vincularAhora().catch(() => {}), new Promise((r) => setTimeout(r, 8_000))]);
  const transmisiones = getTranscriptor()
    .lista()
    .filter((t) => t.partes.includes(parte));
  const e = getMonitor().obtener(parte);

  const selectivas = getSelectivas()
    .recientes(200)
    .filter((s) => s.parte === parte)
    .reverse();

  let resumen = null;
  let error: string | null = null;
  // Cuántas palabras faltan para el primer resumen (se muestra sin gastar tokens)
  const pendiente = transmisiones.length ? estadoResumen(transmisiones) : null;
  if (e && transmisiones.length) {
    try {
      resumen = await resumirRadio(e, transmisiones, selectivas);
    } catch (err) {
      error = err instanceof IANoDisponible ? "IA no disponible" : "No se pudo generar el resumen";
      if (!(err instanceof IANoDisponible)) console.error("[radio] resumen:", (err as Error).message);
    }
  }
  return Response.json({ transmisiones, selectivas, resumen, error, pendiente }, { headers: { "Cache-Control": "no-store" } });
}
