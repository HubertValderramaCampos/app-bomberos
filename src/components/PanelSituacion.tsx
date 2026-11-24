"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { Situacion } from "@/lib/types";
import { useLive } from "./providers/LiveProvider";
import { horaLima } from "@/lib/tiempo";

const NIVEL = {
  normal: { txt: "Normal", cls: "bg-ok/15 text-ok" },
  elevado: { txt: "Elevado", cls: "bg-warn/15 text-warn" },
  critico: { txt: "Crítico", cls: "bg-accent/20 text-accent-strong" },
} as const;

export function PanelSituacion() {
  const { snapshot } = useLive();
  const [s, setS] = useState<Situacion | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ultimaClave = useRef<string>("");
  const ultimaCarga = useRef(0);

  const clave = snapshot?.emergencias.filter((e) => e.activa).map((e) => e.parte).join(",") ?? "";

  useEffect(() => {
    if (!snapshot || clave === ultimaClave.current) return;
    // Como máximo una consulta por minuto; el servidor además cachea.
    const espera = Math.max(0, 60_000 - (Date.now() - ultimaCarga.current));
    const t = setTimeout(() => {
      ultimaClave.current = clave;
      ultimaCarga.current = Date.now();
      fetch("/api/ia/situacion")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Situacion | null) => d && setS(d))
        .catch(() => {});
    }, ultimaCarga.current === 0 ? 0 : espera);
    return () => clearTimeout(t);
  }, [clave, snapshot]);

  if (!s) {
    return <div className="h-[52px] animate-pulse rounded-xl border border-line bg-surface" aria-hidden />;
  }
  const nivel = NIVEL[s.nivel] ?? NIVEL.normal;

  return (
    <section className="rounded-xl border border-line bg-surface px-3 py-2.5" aria-label="Situación operativa">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2.5 text-left" aria-expanded={abierto}>
        <Sparkles className="size-4 shrink-0 text-accent-strong" />
        <span className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${nivel.cls}`}>{nivel.txt}</span>
        <span className={`min-w-0 flex-1 text-[14px] font-semibold leading-snug ${abierto ? "" : "truncate"}`}>{s.titular}</span>
        <ChevronDown className={`size-4 shrink-0 text-dim transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="mt-2 pl-[26px]">
          <ul className="space-y-1 text-sm text-text/85">
            {s.puntos.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-dim" />
                {p}
              </li>
            ))}
          </ul>
          {s.destacadas.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.destacadas.map((d) => (
                <Link key={d.parte} href={`/emergencia/${d.parte}`} className="rounded-lg border border-line-strong bg-surface-3 px-2 py-1 text-xs hover:border-accent">
                  <span className="font-mono text-dim">#{d.parte.slice(-5)}</span> {d.motivo}
                </Link>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-dim">
            {s.local ? "Automático" : "IA"} · {horaLima(s.generado)}
          </p>
        </div>
      )}
    </section>
  );
}
