import { getMonitor } from "@/lib/server/monitor";
import { estadoIA } from "@/lib/server/ia";
import { totalSuscripciones, vapidPublica } from "@/lib/server/push";
import { getTranscriptor, transcripcionHabilitada } from "@/lib/server/radio/transcriptor";

export const dynamic = "force-dynamic";

/** Salud del servicio (para monitoreo y para la pantalla de ajustes). */
export async function GET() {
  const s = getMonitor().snapshot();
  return Response.json({
    sgo: { ok: s.ok, actualizado: s.actualizado, error: s.error, emergencias: s.emergencias.length },
    ia: estadoIA(),
    push: { configurado: !!vapidPublica(), suscripciones: totalSuscripciones() },
    radio: (() => {
      const t = getTranscriptor();
      return { habilitada: transcripcionHabilitada(), activa: t.activo, audio: t.audioOk, actividad: t.actividadOk, transmisiones24h: t.lista().length };
    })(),
  });
}
