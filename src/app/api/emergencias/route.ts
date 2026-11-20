import { getMonitor } from "@/lib/server/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = getMonitor();
  await m.esperarListo();
  return Response.json(m.snapshot(), { headers: { "Cache-Control": "no-store" } });
}
