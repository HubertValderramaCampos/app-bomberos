import { getTranscriptor, transcripcionHabilitada } from "@/lib/server/radio/transcriptor";

export const dynamic = "force-dynamic";

/** Transcripciones recientes de la Central (últimas 3 h, más nuevas primero). */
export async function GET() {
  const t = getTranscriptor();
  const desde = Date.now() - 3 * 3600_000;
  const transmisiones = t
    .lista()
    .filter((x) => new Date(x.ini).getTime() >= desde)
    .slice(-150)
    .reverse();
  return Response.json(
    {
      habilitada: transcripcionHabilitada(),
      activa: t.activo,
      audio: t.audioOk,
      actividad: t.actividadOk,
      transmisiones,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
