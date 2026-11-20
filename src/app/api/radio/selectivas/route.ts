import { getSelectivas } from "@/lib/server/radio/selectivas";

export const dynamic = "force-dynamic";

/** Selectivas recientes identificadas por estación + estado del aprendizaje de cada par de tonos. */
export async function GET() {
  const s = getSelectivas();
  return Response.json({ selectivas: s.recientes(40), pares: s.tablaPares() }, { headers: { "Cache-Control": "no-store" } });
}
