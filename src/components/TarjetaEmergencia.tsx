import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import type { Emergencia } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { formatoDistancia } from "@/lib/geo";
import { hace, horaLima } from "@/lib/tiempo";
import { IconoCategoria } from "./IconoCategoria";

export function EstadoBadge({ estado, activa }: { estado: string; activa: boolean }) {
  return activa ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-strong">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-strong opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-accent-strong" />
      </span>
      {estado === "ATENDIENDO" ? "Atendiendo" : estado.toLowerCase()}
    </span>
  ) : (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-dim">
      {estado === "CERRADO" ? "Cerrado" : estado.toLowerCase()}
    </span>
  );
}

export function TarjetaEmergencia({
  e,
  km,
  nueva,
  ahora,
  seleccionada,
  onHover,
}: {
  e: Emergencia;
  km: number | null;
  nueva?: boolean;
  ahora: number;
  seleccionada?: boolean;
  onHover?: (parte: string | null) => void;
}) {
  const cat = CATEGORIAS[e.categoria];
  return (
    <Link
      href={`/emergencia/${e.parte}`}
      onMouseEnter={() => onHover?.(e.parte)}
      onMouseLeave={() => onHover?.(null)}
      className={`group relative flex gap-3 overflow-hidden rounded-xl border bg-surface p-3 pl-4 transition-colors hover:border-line-strong hover:bg-surface-2 ${
        seleccionada ? "border-line-strong bg-surface-2" : "border-line"
      } ${nueva ? "destello" : ""} ${e.activa ? "" : "opacity-70"}`}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cat.color }} />
      <span
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg"
        style={{ background: `color-mix(in oklab, ${cat.color} 16%, transparent)`, color: cat.color }}
      >
        <IconoCategoria categoria={e.categoria} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-display text-[17px] font-bold uppercase leading-tight tracking-wide">
            {e.tipoPrincipal}
            {nueva && <span className="ml-2 rounded bg-accent px-1.5 py-px align-middle font-sans text-[10px] font-bold text-white">NUEVA</span>}
          </h3>
          <EstadoBadge estado={e.estado} activa={e.activa} />
        </div>
        {e.subtipo && <p className="truncate text-[13px] text-muted">{e.subtipo}</p>}
        <div className="mt-1.5 flex items-start gap-1.5 text-[13px]">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-dim" />
          <span className="min-w-0 flex-1">
            <span className="text-text/90">{e.direccion || "Dirección no registrada"}</span>
            {e.distrito && <span className="font-semibold text-muted"> · {e.distrito}</span>}
          </span>
          {km != null && <span className="shrink-0 font-semibold tabular text-text">{formatoDistancia(km)}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted tabular">
            <Clock className="size-3.5 text-dim" />
            {horaLima(e.fecha)} · {hace(e.fecha, ahora)}
          </span>
          {e.maquinas.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {e.maquinas.slice(0, 6).map((m) => (
                <span key={m} className="rounded bg-surface-3 px-1.5 py-px font-mono text-[11px] text-text/85">
                  {m}
                </span>
              ))}
              {e.maquinas.length > 6 && <span className="text-[11px] text-dim">+{e.maquinas.length - 6}</span>}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
