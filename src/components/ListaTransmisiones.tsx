"use client";

import Link from "next/link";
import { Link2 } from "lucide-react";
import type { Transmision } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { clavesEnTexto } from "@/lib/claves";
import { cortoCanal, nombreCanal } from "@/lib/canales";
import { useLive } from "./providers/LiveProvider";

const hms = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Transcripciones de radio: hora, duración, texto y emergencia vinculada. */
export function ListaTransmisiones({ items, mostrarVinculo = true, nuevas }: { items: Transmision[]; mostrarVinculo?: boolean; nuevas?: Set<string> }) {
  const { snapshot } = useLive();
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const e = t.partes[0] ? snapshot?.emergencias.find((x) => x.parte === t.partes[0]) : null;
        const claves = clavesEnTexto(t.texto);
        return (
          <li key={t.id} className={`flex gap-3 px-4 py-2.5 ${nuevas?.has(t.id) ? "animar-entrada" : ""}`}>
            <div className="w-[52px] shrink-0 pt-0.5 text-right">
              <p className="font-mono text-[13px] tabular text-muted">{hms(t.ini).slice(0, 5)}</p>
              <p className="font-mono text-[10px] tabular text-dim">{t.duracion.toFixed(0)} s</p>
              <p
                className={`mt-1 inline-block rounded px-1 font-mono text-[10px] font-bold ${
                  t.solapado ? "bg-warn/15 text-warn" : t.canal === "C-2" ? "bg-accent/15 text-accent-strong" : "bg-surface-3 text-muted"
                }`}
                title={
                  t.solapado
                    ? `Hablaron a la vez ${(t.canales ?? []).map(nombreCanal).join(" y ")}: el texto puede mezclar voces`
                    : (t.canales ?? [t.canal]).map(nombreCanal).join(" + ")
                }
              >
                {(t.canales && t.canales.length > 1 ? t.canales : [t.canal]).map(cortoCanal).join("+")}
                {t.solapado && " ⚠"}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug text-text/90">{t.texto}</p>
              {claves.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {claves.map((c) => (
                    <span key={c.codigo} className="inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-1.5 py-px text-[12px] text-warn" title={c.grupo}>
                      <span className="font-mono font-semibold">{c.codigo}</span>
                      <span className="text-text/85">{c.significado}</span>
                    </span>
                  ))}
                </div>
              )}
              {(t.unidades.length > 0 || (mostrarVinculo && t.partes.length > 0)) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {t.unidades.map((u) => (
                    <span key={u} className="rounded bg-surface-3 px-1.5 py-px font-mono text-[11px] text-text/80">
                      {u}
                    </span>
                  ))}
                  {mostrarVinculo &&
                    t.partes.map((p) => (
                      <Link
                        key={p}
                        href={`/emergencia/${p}`}
                        className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-px text-[11px] font-semibold hover:border-accent"
                        style={e ? { color: CATEGORIAS[e.categoria].color } : undefined}
                        title={t.vinculo === "ia" ? "Vinculada por IA" : "Vinculada por código de unidad"}
                      >
                        <Link2 className="size-3" />
                        {e ? `${e.tipoPrincipal} · ${e.distrito}` : `Parte ${p.slice(-5)}`}
                      </Link>
                    ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
