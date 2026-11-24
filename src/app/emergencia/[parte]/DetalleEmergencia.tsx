"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Clock, Copy, MapPin, Navigation, Radio, Share2, Truck } from "lucide-react";
import type { Emergencia, UnidadResumen } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { formatoDistancia, urlGoogleMaps, urlWaze } from "@/lib/geo";
import { cronometro, fechaHoraLima, hace } from "@/lib/tiempo";
import { useAhora, useLive } from "@/components/providers/LiveProvider";
import { useRadio } from "@/components/providers/RadioProvider";
import { IconoCategoria } from "@/components/IconoCategoria";
import { EstadoBadge } from "@/components/TarjetaEmergencia";
import { MapaDinamico } from "@/components/MapaDinamico";
import { PanelBriefing } from "@/components/PanelBriefing";
import { PanelRadio } from "@/components/PanelRadio";

export function DetalleEmergencia({ parte }: { parte: string }) {
  const { snapshot, ubicacion, distanciaA } = useLive();
  const radio = useRadio();
  const ahora = useAhora(1_000);
  const [remota, setRemota] = useState<Emergencia | null>(null);
  const [unidades, setUnidades] = useState<UnidadResumen[]>([]);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enVivo = snapshot?.emergencias.find((e) => e.parte === parte) ?? null;
  const e = enVivo ?? remota;
  const maquinasClave = e?.maquinas.join(",");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/emergencias/${parte}`)
      .then(async (r) => {
        const d = (await r.json()) as { emergencia?: Emergencia; unidades?: UnidadResumen[] };
        if (!vivo) return;
        if (d.emergencia) setRemota(d.emergencia);
        else if (r.status === 404) setNoEncontrada(true);
        setUnidades(d.unidades ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [parte, maquinasClave]);

  if (!e) {
    return (
      <div className="space-y-4">
        <Volver />
        {noEncontrada ? (
          <div className="rounded-xl border border-line bg-surface p-8 text-center">
            <p className="font-display text-xl font-bold uppercase">Parte {parte}</p>
            <p className="mt-2 text-sm text-muted">Ya no figura en el SGO</p>
          </div>
        ) : (
          <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
        )}
      </div>
    );
  }

  const cat = CATEGORIAS[e.categoria];
  const km = distanciaA(e);
  const tieneCoords = e.lat != null && e.lng != null;
  const textoCompartir = [
    `${e.tipoPrincipal}${e.subtipo ? ` — ${e.subtipo}` : ""}`,
    `${e.direccion}${e.distrito ? `, ${e.distrito}` : ""}`,
    `${fechaHoraLima(e.fecha)} · ${e.estado}`,
    e.maquinas.length ? `Unidades: ${e.maquinas.join(", ")}` : "",
    `Parte ${e.parte}`,
    tieneCoords ? `https://maps.google.com/?q=${e.lat},${e.lng}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const compartir = async () => {
    const url = `${location.origin}/emergencia/${e.parte}`;
    if (navigator.share) {
      await navigator.share({ title: `${e.tipoPrincipal} · ${e.distrito}`, text: textoCompartir, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${textoCompartir}\n${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  const escucharRadio = () => {
    radio.setCanal("c2");
    if (!radio.reproduciendo) radio.alternar();
  };

  const urlBuscar = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.direccion}, ${e.distrito}, Perú`)}`;

  return (
    <div className="space-y-3">
      <Volver />

      {/* Cabecera: qué, dónde, cuánto tiempo */}
      <header className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 pl-5">
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: cat.color }} />
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl"
            style={{ background: `color-mix(in oklab, ${cat.color} 18%, transparent)`, color: cat.color }}
          >
            <IconoCategoria categoria={e.categoria} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <EstadoBadge estado={e.estado} activa={e.activa} />
            <h1 className="mt-1 font-display text-[26px] font-bold uppercase leading-none tracking-wide">{e.tipoPrincipal}</h1>
            {e.subtipo && <p className="mt-0.5 text-sm text-muted">{e.subtipo}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-mono text-xl font-semibold leading-none tabular ${e.activa ? "text-accent-strong" : "text-muted"}`}>
              {e.activa ? cronometro(e.fecha, ahora) : hace(e.fecha, ahora)}
            </p>
            {km != null && <p className="mt-1 text-sm font-semibold tabular">{formatoDistancia(km)}</p>}
          </div>
        </div>

        <button
          onClick={async () => {
            await navigator.clipboard.writeText(`${e.direccion}, ${e.distrito}`);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="pulsar mt-3 flex w-full items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-left"
          aria-label="Copiar dirección"
        >
          <MapPin className="mt-0.5 size-4 shrink-0 text-accent-strong" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">{e.direccion || "Sin dirección"}</span>
            <span className="block text-sm text-muted">{e.distrito}</span>
          </span>
          {copiado ? <Check className="mt-0.5 size-4 text-ok" /> : <Copy className="mt-0.5 size-4 text-dim" />}
        </button>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-dim">
          <Clock className="size-3.5" /> {fechaHoraLima(e.fecha)} · {e.fuente === "radio" ? "Detectada por radio · esperando SGO" : `Parte ${e.parte}`}
        </p>
        {e.radio && (
          <p className="mt-2 rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">
            🔊 {e.fuente === "radio" ? "Despacho escuchado en la radio de la Central" : `La radio la anunció ${Math.round((e.radio.anticipoSeg ?? 0) / 60)} min antes que el SGO`}
            {e.radio.selectivas.length > 0 && ` · selectiva ${e.radio.selectivas.join(", ")}`}
          </p>
        )}
        {e.unidadesEnEmergencia && e.unidadesEnEmergencia.length > 0 && (
          <p className="mt-2 text-xs text-warn">SGO interno: {e.unidadesEnEmergencia.join(", ")} en emergencia</p>
        )}
      </header>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-4 gap-2">
        <Accion href={tieneCoords ? urlGoogleMaps(e.lat!, e.lng!) : urlBuscar} icono={<Navigation className="size-5" />} texto="Maps" principal />
        {tieneCoords ? (
          <Accion href={urlWaze(e.lat!, e.lng!)} icono={<Navigation className="size-5" />} texto="Waze" />
        ) : (
          <Accion icono={<Navigation className="size-5" />} texto="Waze" deshabilitado />
        )}
        <Accion onClick={escucharRadio} icono={<Radio className="size-5" />} texto="Radio" />
        <Accion onClick={compartir} icono={copiado ? <Check className="size-5 text-ok" /> : <Share2 className="size-5" />} texto="Enviar" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          {/* Unidades */}
          <section className="rounded-2xl border border-line bg-surface p-3.5">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">
              <Truck className="size-4" /> Unidades
              {e.companias.length > 0 && <span className="ml-auto normal-case tracking-normal">{e.companias.map((c) => `B-${c}`).join(" · ")}</span>}
            </h2>
            {e.maquinas.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.maquinas.map((m) => (
                  <span key={m} className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1 font-mono text-sm font-semibold">
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Sin unidades aún</p>
            )}
            {unidades.length > 0 && (
              <p className="mt-2 text-xs text-muted">{unidades.map((u) => `${u.cantidad} ${u.tipo}`).join(" · ")}</p>
            )}
          </section>

          {tieneCoords && (
            <section className="h-52 overflow-hidden rounded-2xl border border-line">
              <MapaDinamico emergencias={[e]} ubicacion={ubicacion} centro={[e.lat!, e.lng!]} zoom={15} seleccion={e.parte} />
            </section>
          )}
        </div>

        <div className="space-y-3">
          <PanelBriefing parte={e.parte} clave={`${e.tipo}|${e.maquinas.length}`} />
          <PanelRadio parte={e.parte} />
        </div>
      </div>
    </div>
  );
}

function Volver() {
  return (
    <Link href="/" className="pulsar -ml-1 inline-flex h-9 items-center gap-0.5 pr-2 text-sm font-semibold text-muted">
      <ChevronLeft className="size-5" /> Volver
    </Link>
  );
}

function Accion({
  href,
  onClick,
  icono,
  texto,
  principal,
  deshabilitado,
}: {
  href?: string;
  onClick?: () => void;
  icono: React.ReactNode;
  texto: string;
  principal?: boolean;
  deshabilitado?: boolean;
}) {
  const cls = `pulsar flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold ${
    principal ? "bg-accent text-white" : "border border-line-strong bg-surface-2"
  } ${deshabilitado ? "pointer-events-none opacity-35" : ""}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {icono}
        {texto}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={deshabilitado} className={cls}>
      {icono}
      {texto}
    </button>
  );
}
