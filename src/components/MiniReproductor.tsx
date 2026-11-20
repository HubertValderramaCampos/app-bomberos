"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, Pause, Play, Radio } from "lucide-react";
import { hablando, useRadio } from "./providers/RadioProvider";
import { BarrasVoz } from "./BarrasVoz";

/** Barra persistente: la radio sigue sonando mientras navegas por la app. */
export function MiniReproductor() {
  const { canal, reproduciendo, cargando, alternar, actividad } = useRadio();
  const path = usePathname();
  if ((!reproduciendo && !cargando) || path === "/radio") return null;
  const voz = hablando(canal, actividad);

  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-[1090] px-3 pb-2 md:bottom-4">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-strong bg-surface-2/95 p-2 pl-3 shadow-2xl shadow-black/60 backdrop-blur-md">
        <Link href="/radio" className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${voz ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted"}`}>
            <Radio className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {canal.nombre}
              <BarrasVoz activo={voz} />
            </span>
            <span className="block truncate text-xs text-muted">{voz ? "Transmisión en curso" : `Radio en vivo · ${canal.frec}`}</span>
          </span>
        </Link>
        <button
          onClick={alternar}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white active:scale-95"
          aria-label={reproduciendo ? "Pausar radio" : "Reproducir radio"}
        >
          {cargando ? <LoaderCircle className="size-5 animate-spin" /> : reproduciendo ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
        </button>
      </div>
    </div>
  );
}
