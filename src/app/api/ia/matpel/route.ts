import { identificarMatpel, IANoDisponible } from "@/lib/server/ia";
import { ipDe, permitir } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGEN = 6 * 1024 * 1024; // ~6 MB en base64

export async function POST(req: Request) {
  if (!permitir(`matpel:${ipDe(req)}`, 20, 10 * 60_000)) {
    return Response.json({ error: "Límite de consultas alcanzado. Intenta en unos minutos." }, { status: 429 });
  }
  let body: { consulta?: string; imagen?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const consulta = (body.consulta ?? "").slice(0, 500);
  const imagen = body.imagen ?? null;
  if (!consulta.trim() && !imagen) {
    return Response.json({ error: "Escribe un N° ONU, nombre o adjunta una foto." }, { status: 400 });
  }
  if (imagen && (!/^data:image\/(jpeg|png|webp);base64,/.test(imagen) || imagen.length > MAX_IMAGEN)) {
    return Response.json({ error: "Imagen no válida o demasiado grande." }, { status: 400 });
  }
  try {
    const r = await identificarMatpel(consulta, imagen);
    return Response.json(r);
  } catch (err) {
    if (err instanceof IANoDisponible) {
      return Response.json(
        { error: "La IA no está disponible en este momento (sin saldo o sin clave). Usa la referencia rápida y la GRE.", codigo: "ia_no_disponible" },
        { status: 503 },
      );
    }
    console.error("[matpel]", err);
    return Response.json({ error: "No se pudo completar la identificación. Intenta de nuevo." }, { status: 500 });
  }
}
