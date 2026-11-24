"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Biohazard, ChevronDown, HardHat, ListChecks, MessageSquareWarning, PackagePlus, Sparkles, TriangleAlert } from "lucide-react";
import type { Briefing } from "@/lib/types";
import { horaLima } from "@/lib/tiempo";

const NIVEL = {
  alto: { txt: "Riesgo alto", cls: "bg-accent/20 text-accent-strong" },
  medio: { txt: "Riesgo medio", cls: "bg-warn/15 text-warn" },
  bajo: { txt: "Riesgo bajo", cls: "bg-ok/15 text-ok" },
} as const;

/** Guía rápida: lo esencial a la vista (acciones y seguridad), el resto plegado. */
export function PanelBriefing({ parte, clave }: { parte: string; clave: string }) {
  const [b, setB] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mas, setMas] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/ia/briefing/${parte}`)
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (r.ok) {
          setB(d as Briefing);
          setError(null);
        } else setError((d as { error?: string }).error ?? "No disponible");
      })
      .catch(() => vivo && setError("Sin conexión"));
    return () => {
      vivo = false;
    };
  }, [parte, clave]);

  if (error && !b) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface" aria-label="Guía rápida">
      <header className="flex items-center gap-2 px-3.5 pt-3">
        <Sparkles className="size-4 text-accent-strong" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Guía rápida</h2>
        {b && <span className={`ml-auto rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${NIVEL[b.nivel].cls}`}>{NIVEL[b.nivel].txt}</span>}
      </header>

      {!b && (
        <div className="space-y-2 p-3.5" aria-busy>
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-3" />
          <div className="h-14 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-14 animate-pulse rounded-lg bg-surface-2" />
        </div>
      )}

      {b && (
        <div className="space-y-3 p-3.5">
          {b.matpel.posible && (
            <Link href="/matpel" className="pulsar flex items-center gap-2.5 rounded-xl border border-cat-matpel/40 bg-cat-matpel/10 p-3 text-sm font-semibold">
              <Biohazard className="size-5 shrink-0 text-cat-matpel" />
              <span className="flex-1">Posible MatPel</span>
              <span className="text-cat-matpel">Identificar →</span>
            </Link>
          )}

          <Bloque icono={<ListChecks className="size-4" />} titulo="Acciones" items={b.acciones.slice(0, 4)} color="#22c55e" numerado />
          <Bloque icono={<HardHat className="size-4" />} titulo="Seguridad" items={b.seguridad.slice(0, 3)} color="#eab308" />

          {mas && (
            <>
              <p className="seleccionable text-sm leading-relaxed text-muted">{b.situacion}</p>
              <Bloque icono={<TriangleAlert className="size-4" />} titulo="Riesgos" items={b.riesgos} color="#f97316" />
              {b.recursos.length > 0 && <Bloque icono={<PackagePlus className="size-4" />} titulo="Recursos" items={b.recursos} color="#60a5fa" />}
              <Bloque icono={<MessageSquareWarning className="size-4" />} titulo="Confirmar con Central" items={b.verificar} color="#a855f7" />
            </>
          )}

          <button onClick={() => setMas((v) => !v)} className="pulsar flex h-9 w-full items-center justify-center gap-1 rounded-lg bg-surface-2 text-[13px] font-semibold text-muted" aria-expanded={mas}>
            {mas ? "Menos" : "Ver riesgos y más"} <ChevronDown className={`size-4 transition-transform ${mas ? "rotate-180" : ""}`} />
          </button>

          <p className="text-[11px] text-dim">
            {b.local ? "Guía automática" : "IA"} · orientativo, manda el oficial al mando · {horaLima(b.generado)}
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
      <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color }}>
        {icono}
        {titulo}
      </h3>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-[14px] leading-snug">
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
