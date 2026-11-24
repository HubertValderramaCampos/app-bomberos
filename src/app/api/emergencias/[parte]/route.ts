import { getMonitor } from "@/lib/server/monitor";
import { obtenerResumenUnidades } from "@/lib/server/sgo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/emergencias/[parte]">) {
  const { parte } = await ctx.params;
  // "R…" = despacho detectado por radio (provisional o ya unido a un parte del SGO)
  if (!/^R?\d{6,}$/.test(parte)) return Response.json({ error: "Parte inválido" }, { status: 400 });

  const m = getMonitor();
  await m.esperarListo();
  const emergencia = m.obtener(parte);
  if (!emergencia) {
    return Response.json(
      { error: "La emergencia ya no figura en el SGO (más de 24 h) o el número es incorrecto.", unidades: [] },
      { status: 404 },
    );
  }
  // Solo se consulta GetResume para partes reales del SGO (no para provisionales por radio)
  const unidades = emergencia.fuente === "radio" ? [] : await obtenerResumenUnidades(emergencia.parte, emergencia.maquinas);
  return Response.json({ emergencia, unidades }, { headers: { "Cache-Control": "no-store" } });
}
