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
            <p className="mt-2 text-sm text-muted">La emergencia ya no figura en el SGO (más de 24 horas) o el número es incorrecto.</p>
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

  return (
    <div className="space-y-4">
      <Volver />

      {/* Cabecera */}
      <header className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="h-1.5" style={{ background: cat.color }} />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-xl"
              style={{ background: `color-mix(in oklab, ${cat.color} 18%, transparent)`, color: cat.color }}
            >
              <IconoCategoria categoria={e.categoria} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <EstadoBadge estado={e.estado} activa={e.activa} />
                <span className="font-mono text-xs text-dim">Parte {e.parte}</span>
              </div>
              <h1 className="mt-1 font-display text-[28px] font-bold uppercase leading-none tracking-wide">{e.tipoPrincipal}</h1>
              {e.subtipo && <p className="mt-1 text-[15px] text-muted">{e.subtipo}</p>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Dato icono={<Clock className="size-4" />} etiqueta="Despacho" valor={fechaHoraLima(e.fecha)} />
            <Dato
              icono={<Clock className="size-4" />}
              etiqueta={e.activa ? "Transcurrido" : "Registrado"}
              valor={e.activa ? cronometro(e.fecha, ahora) : hace(e.fecha, ahora)}
              mono
            />
            {km != null && <Dato icono={<Navigation className="size-4" />} etiqueta="Distancia" valor={formatoDistancia(km)} />}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {/* Ubicación */}
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            {tieneCoords ? (
              <div className="h-56">
                <MapaDinamico emergencias={[e]} ubicacion={ubicacion} centro={[e.lat!, e.lng!]} zoom={15} seleccion={e.parte} />
              </div>
            ) : (
              <div className="grid h-24 place-items-center bg-surface-2 text-sm text-dim">Sin georreferencia en el SGO</div>
            )}
            <div className="p-4">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-dim" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.direccion || "Dirección no registrada"}</p>
                  <p className="text-sm text-muted">{e.distrito}</p>
                </div>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${e.direccion}, ${e.distrito}`);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  }}
                  className="rounded-lg p-2 text-dim hover:bg-surface-2 hover:text-text"
                  aria-label="Copiar dirección"
                >
                  {copiado ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {tieneCoords ? (
                  <>
                    <a href={urlGoogleMaps(e.lat!, e.lng!)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white active:scale-[0.98]">
                      <Navigation className="size-4" /> Google Maps
                    </a>
                    <a href={urlWaze(e.lat!, e.lng!)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-3 font-semibold active:scale-[0.98]">
                      <Navigation className="size-4" /> Waze
                    </a>
                  </>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.direccion}, ${e.distrito}, Perú`)}`}
                    target="_blank"
                    rel="noopener"
                    className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-3 font-semibold"
                  >
                    <MapPin className="size-4" /> Buscar dirección en Google Maps
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Unidades */}
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">
              <Truck className="size-4" /> Unidades despachadas
            </h2>
            {e.maquinas.length ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {e.maquinas.map((m) => (
                  <span key={m} className="rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1 font-mono text-sm font-semibold">
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Aún no hay unidades registradas.</p>
            )}
            {unidades.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {unidades.map((u) => (
                  <li key={u.codigo + u.tipo} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-text/85">{u.tipo}</span>
                    <span className="font-semibold tabular">{u.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
            {e.companias.length > 0 && (
              <p className="mt-2 text-xs text-dim">Compañías: {e.companias.map((c) => `B-${c}`).join(", ")}</p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={escucharRadio} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 font-semibold active:scale-[0.98]">
              <Radio className="size-4" /> Escuchar Central
            </button>
            <button onClick={compartir} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 font-semibold active:scale-[0.98]">
              {copiado ? <Check className="size-4 text-ok" /> : <Share2 className="size-4" />} Compartir
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <PanelRadio parte={e.parte} />
          <PanelBriefing parte={e.parte} clave={`${e.tipo}|${e.maquinas.length}`} />
        </div>
      </div>
    </div>
  );
}

function Volver() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
      <ChevronLeft className="size-4" /> Emergencias
    </Link>
  );
}

function Dato({ icono, etiqueta, valor, mono }: { icono: React.ReactNode; etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
        {icono}
        {etiqueta}
      </p>
      <p className={`mt-0.5 text-[15px] font-semibold ${mono ? "font-mono tabular" : ""}`}>{valor}</p>
    </div>
  );
}
