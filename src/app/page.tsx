"use client";

import { useMemo, useState } from "react";
import { List, LocateFixed, Map as MapIcon, Search, X } from "lucide-react";
import type { Categoria } from "@/lib/types";
import { CATEGORIAS, ORDEN_CATEGORIAS } from "@/lib/categorias";
import { hace } from "@/lib/tiempo";
import { useAhora, useLive } from "@/components/providers/LiveProvider";
import { TarjetaEmergencia } from "@/components/TarjetaEmergencia";
import { PanelSituacion } from "@/components/PanelSituacion";
import { MapaDinamico } from "@/components/MapaDinamico";
import { IconoCategoria } from "@/components/IconoCategoria";

type Alcance = "activas" | "todas";
type Orden = "recientes" | "cercanas";

export default function EnVivo() {
  const { snapshot, conexion, ubicacion, estadoUbicacion, pedirUbicacion, recientes, distanciaA } = useLive();
  const ahora = useAhora(10_000);
  const [cat, setCat] = useState<Categoria | null>(null);
  const [alcance, setAlcance] = useState<Alcance>("activas");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  const todas = useMemo(() => snapshot?.emergencias ?? [], [snapshot]);
  const base = useMemo(() => (alcance === "activas" ? todas.filter((e) => e.activa) : todas), [todas, alcance]);

  const conteos = useMemo(() => {
    const c = new Map<Categoria, number>();
    for (const e of base) c.set(e.categoria, (c.get(e.categoria) ?? 0) + 1);
    return c;
  }, [base]);

  const lista = useMemo(() => {
    const nq = q.trim().toUpperCase();
    let l = base.filter((e) => !cat || e.categoria === cat);
    if (nq) {
      l = l.filter((e) => `${e.direccion} ${e.distrito} ${e.tipo} ${e.maquinas.join(" ")} ${e.parte}`.toUpperCase().includes(nq));
    }
    const conKm = l.map((e) => ({ e, km: distanciaA(e) }));
    if (orden === "cercanas" && ubicacion) {
      conKm.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    }
    return conKm;
  }, [base, cat, q, orden, ubicacion, distanciaA]);

  const activas = todas.filter((e) => e.activa).length;
  const unidades = todas.filter((e) => e.activa).reduce((s, e) => s + e.maquinas.length, 0);
  const cercanas = ubicacion ? todas.filter((e) => e.activa && (distanciaA(e) ?? Infinity) <= 5).length : null;

  return (
    <div className="space-y-4">
      {/* Estado en vivo + contadores */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              {conexion === "en_vivo" && snapshot?.ok !== false && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-strong opacity-75" />}
              <span className={`relative inline-flex size-2.5 rounded-full ${conexion === "en_vivo" && snapshot?.ok !== false ? "bg-accent-strong" : "bg-warn"}`} />
            </span>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Emergencias en vivo</h1>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {conexion !== "en_vivo"
              ? "Conectando con el servidor…"
              : snapshot?.ok === false
                ? `${snapshot.error ?? "Fuente SGO sin respuesta"}${snapshot.actualizado ? ` · último dato ${hace(snapshot.actualizado, ahora)}` : ""}`
                : snapshot?.actualizado
                  ? `SGO · CGBVP — actualizado ${hace(snapshot.actualizado, ahora)}`
                  : "Cargando…"}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center sm:flex sm:gap-2">
          <Kpi valor={activas} etiqueta="Activas" acento />
          <Kpi valor={unidades} etiqueta="Unidades" />
          {cercanas != null ? <Kpi valor={cercanas} etiqueta="A ≤ 5 km" /> : <Kpi valor={todas.length} etiqueta="En 24 h" />}
        </dl>
      </div>

      <PanelSituacion />

      {estadoUbicacion !== "activa" && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 p-3 text-sm">
          <LocateFixed className="size-5 shrink-0 text-[#60a5fa]" />
          <p className="flex-1 text-muted">
            {estadoUbicacion === "denegada"
              ? "Ubicación bloqueada. Actívala en los ajustes del navegador para ver distancias."
              : estadoUbicacion === "no_disponible"
                ? "No se pudo obtener tu ubicación."
                : "Activa tu ubicación para ver distancias y ordenar por cercanía."}
          </p>
          {(estadoUbicacion === "inactiva" || estadoUbicacion === "no_disponible") && (
            <button onClick={pedirUbicacion} className="shrink-0 rounded-lg bg-surface-3 px-3 py-1.5 text-sm font-semibold hover:bg-line-strong">
              Activar
            </button>
          )}
          {estadoUbicacion === "solicitando" && <span className="text-xs text-dim">Buscando…</span>}
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-2.5">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          <Chip activo={cat === null} onClick={() => setCat(null)}>
            Todas <span className="tabular text-dim">{base.length}</span>
          </Chip>
          {ORDEN_CATEGORIAS.filter((c) => conteos.get(c)).map((c) => (
            <Chip key={c} activo={cat === c} onClick={() => setCat(cat === c ? null : c)} color={CATEGORIAS[c].color}>
              <IconoCategoria categoria={c} className="size-3.5" style={{ color: CATEGORIAS[c].color }} />
              {CATEGORIAS[c].corto} <span className="tabular text-dim">{conteos.get(c)}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmento
            valor={alcance}
            onChange={(v) => setAlcance(v as Alcance)}
            opciones={[
              { v: "activas", t: "Activas" },
              { v: "todas", t: "Últimas 24 h" },
            ]}
          />
          <Segmento
            valor={orden}
            onChange={(v) => {
              if (v === "cercanas" && !ubicacion) pedirUbicacion();
              setOrden(v as Orden);
            }}
            opciones={[
              { v: "recientes", t: "Recientes" },
              { v: "cercanas", t: "Cercanas" },
            ]}
          />
          <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Distrito, dirección o unidad"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-8 text-sm placeholder:text-dim focus:border-line-strong focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim" aria-label="Limpiar búsqueda">
                <X className="size-4" />
              </button>
            )}
          </label>
          <div className="lg:hidden">
            <Segmento
              valor={vista}
              onChange={(v) => setVista(v as "lista" | "mapa")}
              opciones={[
                { v: "lista", t: <List className="size-4" aria-label="Lista" /> },
                { v: "mapa", t: <MapIcon className="size-4" aria-label="Mapa" /> },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Lista + mapa */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className={`space-y-2 ${vista === "mapa" ? "hidden lg:block" : ""}`}>
          {!snapshot &&
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-xl border border-line bg-surface" />)}
          {snapshot && lista.length === 0 && (
            <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
              {q || cat ? "Sin resultados con estos filtros." : alcance === "activas" ? "No hay emergencias activas en este momento." : "Sin emergencias registradas."}
            </div>
          )}
          {lista.map(({ e, km }) => (
            <TarjetaEmergencia key={e.parte} e={e} km={km} nueva={recientes.has(e.parte)} ahora={ahora} seleccionada={hover === e.parte} onHover={setHover} />
          ))}
        </div>
        <div className={`${vista === "lista" ? "hidden lg:block" : ""}`}>
          <div className="h-[calc(100dvh-260px)] min-h-[420px] overflow-hidden rounded-xl border border-line lg:sticky lg:top-[72px] lg:h-[calc(100dvh-96px)]">
            <MapaDinamico emergencias={lista.map((x) => x.e)} ubicacion={ubicacion} seleccion={hover} ajustar={!ubicacion} />
          </div>
        </div>
      </div>

      <p className="pt-2 text-center text-[11px] leading-relaxed text-dim">
        App independiente; no es un canal oficial del CGBVP. Datos: SGO público del CGBVP (emergencias de las últimas 24 h).
      </p>
    </div>
  );
}

function Kpi({ valor, etiqueta, acento }: { valor: number; etiqueta: string; acento?: boolean }) {
  return (
    <div className="min-w-[78px] rounded-xl border border-line bg-surface px-3 py-1.5">
      <dd className={`font-display text-2xl font-bold leading-none tabular ${acento ? "text-accent-strong" : ""}`}>{valor}</dd>
      <dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">{etiqueta}</dt>
    </div>
  );
}

function Chip({ activo, onClick, children, color }: { activo: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        activo ? "border-transparent bg-text text-bg [&_.text-dim]:text-bg/60" : "border-line bg-surface text-text/85 hover:border-line-strong"
      }`}
      style={activo && color ? { background: color, color: "#0b0d11" } : undefined}
      aria-pressed={activo}
    >
      {children}
    </button>
  );
}

function Segmento({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: { v: string; t: React.ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group">
      {opciones.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex h-8 items-center rounded-md px-3 text-[13px] font-medium transition-colors ${valor === o.v ? "bg-surface-3 text-text" : "text-muted hover:text-text"}`}
          aria-pressed={valor === o.v}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
