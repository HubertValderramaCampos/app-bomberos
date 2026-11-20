"use client";

import { useEffect, useMemo, useState } from "react";
import { AudioLines, PackagePlus, TriangleAlert } from "lucide-react";
import type { ResumenRadio, Transmision } from "@/lib/types";
import { horaLima } from "@/lib/tiempo";
import { useLive } from "./providers/LiveProvider";
import { ListaTransmisiones } from "./ListaTransmisiones";

/** Lo que la Central y las unidades dijeron por radio sobre esta emergencia. */
export function PanelRadio({ parte }: { parte: string }) {
  const { transmisiones: enVivo, transcripcionHabilitada } = useLive();
  const [txs, setTxs] = useState<Transmision[]>([]);
  const [resumen, setResumen] = useState<ResumenRadio | null>(null);
  const [cargado, setCargado] = useState(false);

  // Cuántas transmisiones vinculadas llegaron en vivo: al cambiar, se pide un resumen actualizado
  const vinculadasEnVivo = useMemo(() => enVivo.filter((t) => t.partes.includes(parte)).map((t) => t.id).join(","), [enVivo, parte]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/radio/emergencia/${parte}`)
      .then((r) => r.json())
      .then((d: { transmisiones: Transmision[]; resumen: ResumenRadio | null }) => {
        if (!vivo) return;
        setTxs(d.transmisiones);
        setResumen(d.resumen);
        setCargado(true);
      })
      .catch(() => vivo && setCargado(true));
    return () => {
      vivo = false;
    };
  }, [parte, vinculadasEnVivo]);

  if (transcripcionHabilitada === false) return null;
  const lista = [...txs].reverse();

  return (
    <section className="rounded-2xl border border-line bg-surface" aria-label="Radio de la Central">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <AudioLines className="size-4 text-ok" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Radio · lo comunicado</h2>
        {txs.length > 0 && <span className="ml-auto text-[11px] text-dim">{txs.length} transmisiones</span>}
      </header>

      {!cargado && <div className="m-4 h-16 animate-pulse rounded-lg bg-surface-2" />}

      {cargado && txs.length === 0 && (
        <p className="p-4 text-sm text-muted">
          Aún no hay comunicaciones de radio vinculadas a esta emergencia. Se transcriben los canales 1 a 4 de la IV Comandancia
          (Lima Centro); las emergencias de otras zonas no pasan por esta radio.
        </p>
      )}

      {resumen && (
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ok">{resumen.estado_actual}</span>
          </div>
          <p className="text-[15px] leading-relaxed text-text/90">{resumen.resumen}</p>

          {resumen.alertas.length > 0 && (
            <div className="space-y-1 rounded-xl border border-accent/40 bg-accent/10 p-3">
              {resumen.alertas.map((a, i) => (
                <p key={i} className="flex gap-2 text-sm font-medium">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                  {a}
                </p>
              ))}
            </div>
          )}

          {resumen.cronologia.length > 0 && (
            <ol className="relative ml-1.5 space-y-2 border-l border-line-strong pl-4">
              {resumen.cronologia.map((c, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-ok" />
                  <span className="mr-2 font-mono text-xs tabular text-dim">{c.hora}</span>
                  {c.evento}
                </li>
              ))}
            </ol>
          )}

          {resumen.solicitudes.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#60a5fa]">
                <PackagePlus className="size-3.5" /> Solicitado por radio
              </h3>
              <ul className="space-y-0.5 text-sm">
                {resumen.solicitudes.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-dim">Resumen con IA de las transcripciones · {horaLima(resumen.generado)}</p>
        </div>
      )}

      {lista.length > 0 && (
        <div className="max-h-96 overflow-y-auto scroll-thin">
          <ListaTransmisiones items={lista} mostrarVinculo={false} />
        </div>
      )}
      {txs.length > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-dim">
          Transcripción automática (Whisper): puede confundir números y nombres. Ante la duda, escucha la radio.
        </p>
      )}
    </section>
  );
}
