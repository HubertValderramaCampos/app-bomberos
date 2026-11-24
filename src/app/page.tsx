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
import { Credito } from "@/components/Credito";

type Alcance = "activas" | "todas";

export default function EnVivo() {
  const { snapshot, ubicacion, estadoUbicacion, pedirUbicacion, recientes, distanciaA } = useLive();
  const ahora = useAhora(10_000);
  const [cat, setCat] = useState<Categoria | null>(null);
  const [alcance, setAlcance] = useState<Alcance>("activas");
  const [cercanas, setCercanas] = useState(false);
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
  const [buscando, setBuscando] = useState(false);
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
    if (cercanas && ubicacion) conKm.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return conKm;
  }, [base, cat, q, cercanas, ubicacion, distanciaA]);

  const activas = todas.filter((e) => e.activa).length;
  const unidades = todas.filter((e) => e.activa).reduce((s, e) => s + e.maquinas.length, 0);
  const aMano = ubicacion ? todas.filter((e) => e.activa && (distanciaA(e) ?? Infinity) <= 5).length : null;

  const alternarCercanas = () => {
    if (!cercanas && !ubicacion) pedirUbicacion();
    setCercanas((v) => !v);
  };

  return (
    <div className="space-y-3">
      {snapshot?.ok === false && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
          Sin datos nuevos del SGO{snapshot.actualizado ? ` · último ${hace(snapshot.actualizado, ahora)}` : ""}
        </p>
      )}

      {/* Contadores */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Kpi valor={activas} etiqueta="Activas" acento />
        <Kpi valor={unidades} etiqueta="Unidades" />
        {aMano != null ? <Kpi valor={aMano} etiqueta="A 5 km" /> : <Kpi valor={todas.length} etiqueta="24 h" />}
      </dl>

      <PanelSituacion />

      {/* Filtros: una fila de categorías y una de controles */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        <Chip activo={cat === null} onClick={() => setCat(null)}>
          Todas <span className="tabular opacity-60">{base.length}</span>
        </Chip>
        {ORDEN_CATEGORIAS.filter((c) => conteos.get(c)).map((c) => (
          <Chip key={c} activo={cat === c} onClick={() => setCat(cat === c ? null : c)} color={CATEGORIAS[c].color}>
            <IconoCategoria categoria={c} className="size-3.5" style={{ color: cat === c ? undefined : CATEGORIAS[c].color }} />
            {CATEGORIAS[c].corto} <span className="tabular opacity-60">{conteos.get(c)}</span>
          </Chip>
        ))}
      </div>

      {buscando ? (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Distrito, calle o unidad"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-10 text-[15px] placeholder:text-dim focus:border-line-strong focus:outline-none"
          />
          <button
            onClick={() => {
              setQ("");
              setBuscando(false);
            }}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-dim"
            aria-label="Cerrar búsqueda"
          >
            <X className="size-4" />
          </button>
        </label>
      ) : (
        <div className="flex items-center gap-2">
          <Segmento
            valor={alcance}
            onChange={(v) => setAlcance(v as Alcance)}
            opciones={[
              { v: "activas", t: "Activas" },
              { v: "todas", t: "24 h" },
            ]}
          />
          <div className="ml-auto flex gap-2">
            <BotonIcono on={cercanas && !!ubicacion} onClick={alternarCercanas} etiqueta="Ordenar por cercanía" ocupado={estadoUbicacion === "solicitando"}>
              <LocateFixed className="size-[18px]" />
            </BotonIcono>
            <BotonIcono onClick={() => setBuscando(true)} etiqueta="Buscar">
              <Search className="size-[18px]" />
            </BotonIcono>
            <span className="lg:hidden">
              <BotonIcono
                on={vista === "mapa"}
                onClick={() => setVista(vista === "lista" ? "mapa" : "lista")}
                etiqueta={vista === "lista" ? "Ver mapa" : "Ver lista"}
              >
                {vista === "lista" ? <MapIcon className="size-[18px]" /> : <List className="size-[18px]" />}
              </BotonIcono>
            </span>
          </div>
        </div>
      )}
      {cercanas && estadoUbicacion === "denegada" && <p className="text-xs text-warn">Ubicación bloqueada en los ajustes del teléfono.</p>}

      {/* Lista + mapa */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className={`space-y-2 ${vista === "mapa" ? "hidden lg:block" : ""}`}>
          {!snapshot &&
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[96px] animate-pulse rounded-xl border border-line bg-surface" />)}
          {snapshot && lista.length === 0 && (
            <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
              {q || cat ? "Sin resultados" : alcance === "activas" ? "Sin emergencias activas" : "Sin emergencias"}
            </div>
          )}
          {lista.map(({ e, km }) => (
            <TarjetaEmergencia key={e.parte} e={e} km={km} nueva={recientes.has(e.parte)} ahora={ahora} seleccionada={hover === e.parte} onHover={setHover} />
          ))}
        </div>
        <div className={`${vista === "lista" ? "hidden lg:block" : ""}`}>
          <div className="h-[calc(100dvh-280px)] min-h-[380px] overflow-hidden rounded-xl border border-line lg:sticky lg:top-[64px] lg:h-[calc(100dvh-88px)]">
            <MapaDinamico emergencias={lista.map((x) => x.e)} ubicacion={ubicacion} seleccion={hover} ajustar={!ubicacion} />
          </div>
        </div>
      </div>

      <Credito className="pt-3" />
    </div>
  );
}

function Kpi({ valor, etiqueta, acento }: { valor: number; etiqueta: string; acento?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface py-2">
      <dd className={`font-display text-[26px] font-bold leading-none tabular ${acento ? "text-accent-strong" : ""}`}>{valor}</dd>
      <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">{etiqueta}</dt>
    </div>
  );
}

function Chip({ activo, onClick, children, color }: { activo: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`pulsar flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${
        activo ? "border-transparent bg-text text-bg" : "border-line bg-surface text-text/85"
      }`}
      style={activo && color ? { background: color, color: "#0b0d11" } : undefined}
      aria-pressed={activo}
    >
      {children}
    </button>
  );
}

function BotonIcono({ on, onClick, etiqueta, ocupado, children }: { on?: boolean; onClick: () => void; etiqueta: string; ocupado?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      aria-pressed={on}
      title={etiqueta}
      className={`pulsar grid size-10 place-items-center rounded-xl border ${on ? "border-transparent bg-accent text-white" : "border-line bg-surface text-muted"} ${ocupado ? "animate-pulse" : ""}`}
    >
      {children}
    </button>
  );
}

function Segmento({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: { v: string; t: React.ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5" role="group">
      {opciones.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex h-9 items-center rounded-[10px] px-4 text-[13px] font-semibold ${valor === o.v ? "bg-surface-3 text-text" : "text-dim"}`}
          aria-pressed={valor === o.v}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
