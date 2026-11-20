import { getMonitor, type EventoMonitor } from "@/lib/server/monitor";
import { getTranscriptor } from "@/lib/server/radio/transcriptor";
import { getSelectivas } from "@/lib/server/radio/selectivas";
import type { SelectivaInfo, Transmision } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events: un solo sondeo del SGO en el servidor se reparte a todos los clientes.
 * Eventos: snapshot (lista completa), estado (latido), nueva, actualizada.
 */
export async function GET(req: Request) {
  const m = getMonitor();
  await m.esperarListo();
  const enc = new TextEncoder();
  let limpiar = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let cerrado = false;
      const enviar = (evento: string, data: unknown) => {
        if (cerrado) return;
        try {
          controller.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          limpiar();
        }
      };

      controller.enqueue(enc.encode(`retry: 5000\n\n`));
      enviar("snapshot", m.snapshot());

      const onEvento = (ev: EventoMonitor) => enviar(ev.tipo, ev.data);
      m.on("evento", onEvento);
      const onTransmision = (tx: Transmision) => enviar("transmision", tx);
      const radio = getTranscriptor();
      radio.on("transmision", onTransmision);
      const onSelectiva = (s: SelectivaInfo) => enviar("selectiva", s);
      const selectivas = getSelectivas();
      selectivas.on("selectiva", onSelectiva);
      const latido = setInterval(() => {
        if (cerrado) return;
        try {
          controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          limpiar();
        }
      }, 20_000);

      limpiar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(latido);
        m.off("evento", onEvento);
        radio.off("transmision", onTransmision);
        selectivas.off("selectiva", onSelectiva);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      req.signal.addEventListener("abort", limpiar);
    },
    cancel() {
      limpiar();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
