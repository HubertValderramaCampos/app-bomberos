import { getMonitor } from "@/lib/server/monitor";
import { obtenerSituacion } from "@/lib/server/ia";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = getMonitor();
  await m.esperarListo();
  const s = await obtenerSituacion(m.snapshot().emergencias);
  return Response.json(s, { headers: { "Cache-Control": "no-store" } });
}
