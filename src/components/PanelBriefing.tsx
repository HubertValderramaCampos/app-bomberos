"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Biohazard, ClipboardCheck, HardHat, ListChecks, MessageSquareWarning, PackagePlus, Sparkles, TriangleAlert } from "lucide-react";
import type { Briefing } from "@/lib/types";
import { horaLima } from "@/lib/tiempo";

const NIVEL = {
  alto: { txt: "Riesgo alto", cls: "bg-accent/20 text-accent-strong" },
  medio: { txt: "Riesgo medio", cls: "bg-warn/15 text-warn" },
  bajo: { txt: "Riesgo bajo", cls: "bg-ok/15 text-ok" },
} as const;

export function PanelBriefing({ parte, clave }: { parte: string; clave: string }) {
  const [b, setB] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/ia/briefing/${parte}`)
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (r.ok) {
          setB(d as Briefing);
          setError(null);
        }
        else setError((d as { error?: string }).error ?? "No disponible");
      })
      .catch(() => vivo && setError("Sin conexión"));
    return () => {
      vivo = false;
    };
  }, [parte, clave]);

  return (
    <section className="rounded-2xl border border-line bg-surface" aria-label="Briefing operativo">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles className="size-4 text-accent-strong" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Briefing operativo</h2>
        {b && <span className={`ml-auto rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${NIVEL[b.nivel].cls}`}>{NIVEL[b.nivel].txt}</span>}
      </header>

      {!b && !error && (
        <div className="space-y-3 p-4" aria-busy>
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-3" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-3" />
          <div className="h-20 animate-pulse rounded bg-surface-2" />
          <div className="h-20 animate-pulse rounded bg-surface-2" />
          <p className="text-xs text-dim">Analizando la emergencia…</p>
        </div>
      )}
      {error && !b && <p className="p-4 text-sm text-muted">{error}</p>}

      {b && (
        <div className="space-y-4 p-4">
          <p className="text-[15px] leading-relaxed text-text/90">{b.situacion}</p>

          {b.matpel.posible && (
            <Link href="/matpel" className="flex items-start gap-3 rounded-xl border border-cat-matpel/40 bg-cat-matpel/10 p-3">
              <Biohazard className="mt-0.5 size-5 shrink-0 text-cat-matpel" />
              <span className="text-sm">
                <span className="font-semibold">Posible presencia de materiales peligrosos.</span>{" "}
                <span className="text-muted">{b.matpel.nota || "Identifica el material antes de intervenir."}</span>{" "}
                <span className="font-semibold text-cat-matpel">Abrir MatPel →</span>
              </span>
            </Link>
          )}

          <Bloque icono={<TriangleAlert className="size-4" />} titulo="Riesgos probables" items={b.riesgos} color="#f97316" />
          <Bloque icono={<HardHat className="size-4" />} titulo="Seguridad del personal" items={b.seguridad} color="#eab308" />
          <Bloque icono={<ListChecks className="size-4" />} titulo="Acciones iniciales" items={b.acciones} color="#22c55e" numerado />
          {b.recursos.length > 0 && <Bloque icono={<PackagePlus className="size-4" />} titulo="Recursos a considerar" items={b.recursos} color="#60a5fa" />}
          <Bloque icono={<MessageSquareWarning className="size-4" />} titulo="Verificar con la Central" items={b.verificar} color="#a855f7" />

          <p className="flex items-start gap-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
            <ClipboardCheck className="mt-px size-3.5 shrink-0" />
            {b.local ? "Guía automática por tipo de emergencia (IA no disponible). " : "Generado con IA a partir de los datos del SGO. "}
            Es orientativo: prevalecen los procedimientos del CGBVP y las órdenes del oficial al mando. · {horaLima(b.generado)}
          </p>
        </div>
      )}
    </section>
  );
}

function Bloque({ icono, titulo, items, color, numerado }: { icono: React.ReactNode; titulo: string; items: string[]; color: string; numerado?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide" style={{ color }}>
        {icono}
        {titulo}
      </h3>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-snug">
            {numerado ? (
              <span className="font-mono text-xs font-semibold leading-5 text-dim">{i + 1}</span>
            ) : (
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            )}
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
