import { getMonitor } from "@/lib/server/monitor";
import { briefingEnCache, obtenerBriefing } from "@/lib/server/ia";
import { ipDe, permitir } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/ia/briefing/[parte]">) {
  const { parte } = await ctx.params;
  const m = getMonitor();
  await m.esperarListo();
  const e = m.obtener(parte);
  if (!e) {
    const previo = briefingEnCache(parte);
    if (previo) return Response.json(previo);
    return Response.json({ error: "Emergencia no encontrada" }, { status: 404 });
  }
  // El briefing se cachea por parte, así que el costo está acotado; el límite evita abuso.
  if (!briefingEnCache(parte) && !permitir(`briefing:${ipDe(req)}`, 30, 10 * 60_000)) {
    return Response.json({ error: "Demasiadas solicitudes, intenta en unos minutos." }, { status: 429 });
  }
  // Sin consulta extra al SGO: el briefing trabaja con los códigos de unidad que ya tenemos
  const b = await obtenerBriefing(e);
  return Response.json(b, { headers: { "Cache-Control": "no-store" } });
}
