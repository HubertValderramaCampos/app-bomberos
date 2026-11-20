"use client";

import { useState } from "react";
import { ChevronDown, RadioTower } from "lucide-react";
import type { ParTonos } from "@/lib/types";
import { ESTACIONES_IV_CDLC } from "@/lib/estaciones";

/** Estaciones de la IV CDLC y el par de tonos de su selectiva (confirmado, aprendido o pendiente). */
export function TablaEstaciones({ pares }: { pares: ParTonos[] }) {
  const [abierto, setAbierto] = useState(false);
  const porCia = new Map<string, ParTonos>();
  for (const p of pares) {
    if (!p.cia) continue;
    const previo = porCia.get(p.cia);
    // Si una estación tiene varios pares candidatos, se muestra el más fiable
    if (!previo || (p.origen === "confirmada" && previo.origen !== "confirmada") || (p.confianza ?? 0) > (previo.confianza ?? 0)) porCia.set(p.cia, p);
  }
  const identificadas = ESTACIONES_IV_CDLC.filter((e) => porCia.has(e.cia)).length;
  const desconocidos = pares.filter((p) => !p.cia && p.veces > 0);

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={abierto}>
        <RadioTower className="size-4 text-accent-strong" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Estaciones IV CDLC · selectivas</span>
        <span className="ml-auto text-xs text-dim">
          {identificadas}/{ESTACIONES_IV_CDLC.length} identificadas
        </span>
        <ChevronDown className={`size-4 text-dim transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="border-t border-line">
          <ul className="divide-y divide-line">
            {ESTACIONES_IV_CDLC.map((e) => {
              const p = porCia.get(e.cia);
              return (
                <li key={e.cia} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-14 shrink-0 font-display text-lg font-bold">{e.cia}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{e.nombre}</span>
                    <span className="block text-xs text-dim">{e.distrito}</span>
                  </span>
                  {p ? (
                    <span className="text-right">
                      <span className="block font-mono text-xs text-text/85">{p.par}</span>
                      <span className={`text-[10px] font-bold uppercase ${p.origen === "confirmada" ? "text-ok" : "text-warn"}`}>
                        {p.origen === "confirmada" ? "confirmada" : `probable ${Math.round((p.confianza ?? 0) * 100)} %`}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-dim">aprendiendo…</span>
                  )}
                </li>
              );
            })}
          </ul>
          {desconocidos.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dim">Pares aún sin estación</p>
              <div className="flex flex-wrap gap-1.5">
                {desconocidos.map((p) => {
                  const pistas = Object.entries(p.votos).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  return (
                    <span key={p.par} className="rounded-md bg-surface-2 px-2 py-1 text-xs" title={pistas.length ? `Evidencia: ${pistas.map(([c, v]) => `${c} (${v})`).join(", ")}` : "Sin evidencia todavía"}>
                      <span className="font-mono">{p.par}</span> <span className="text-dim">×{p.veces}</span>
                      {pistas[0] && <span className="ml-1 text-warn">¿{pistas[0][0]}?</span>}
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-dim">
                Un par pasa a «probable» con 3 coincidencias o más y al menos 60 % de la evidencia para una estación. Los pares que se
                confirmen con certeza se pueden fijar en <span className="font-mono">src/lib/estaciones.ts</span>.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
