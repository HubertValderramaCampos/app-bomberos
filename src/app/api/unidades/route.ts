import { estadoUnidades } from "@/lib/server/unidades";

export const dynamic = "force-dynamic";

/** Estado en vivo de las unidades de Lima y Callao (SGO interno, vía el scraper). */
export async function GET() {
  return Response.json(estadoUnidades(), { headers: { "Cache-Control": "no-store" } });
}
