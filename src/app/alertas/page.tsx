"use client";

import { useEffect, useRef, useState } from "react";
import { BellOff, BellRing, Check, Crosshair, Info, LoaderCircle, Send, Share, Smartphone, Vibrate, Volume2 } from "lucide-react";
import type { Categoria } from "@/lib/types";
import { CATEGORIAS, ORDEN_CATEGORIAS } from "@/lib/categorias";
import { useLive } from "@/components/providers/LiveProvider";
import { MapaDinamico } from "@/components/MapaDinamico";
import { IconoCategoria } from "@/components/IconoCategoria";
import { activarPush, desactivarPush, esIOS, esStandalone, probarPush, sincronizarPush, soportaPush, suscripcionActual } from "@/lib/cliente/push";
import { tonoAlerta } from "@/lib/cliente/sonido";
import { distanciaKm } from "@/lib/geo";
import { Credito } from "@/components/Credito";

type EstadoPush = "cargando" | "no_soportado" | "ios_instalar" | "denegado" | "inactivo" | "activo";

interface EstadoServidor {
  sgo: { ok: boolean; emergencias: number };
  ia: { configurada: boolean; disponible: boolean; ultimoError: string | null };
  push: { configurado: boolean; suscripciones: number };
}

export default function AlertasPage() {
  const { prefs, setPrefs, ubicacion, pedirUbicacion, estadoUbicacion, snapshot } = useLive();
  const [estado, setEstado] = useState<EstadoPush>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; txt: string } | null>(null);
  const [servidor, setServidor] = useState<EstadoServidor | null>(null);
  const primeraSync = useRef(true);

  useEffect(() => {
    document.title = "Alertas · Alerta 116";
    fetch("/api/estado")
      .then((r) => r.json())
      .then(setServidor)
      .catch(() => {});
    (async () => {
      if (!soportaPush()) return setEstado(esIOS() && !esStandalone() ? "ios_instalar" : "no_soportado");
      if (Notification.permission === "denied") return setEstado("denegado");
      setEstado((await suscripcionActual()) ? "activo" : "inactivo");
    })();
  }, []);

  // Con push activo, cada cambio de preferencias se guarda en el servidor
  useEffect(() => {
    if (estado !== "activo") return;
    if (primeraSync.current) {
      primeraSync.current = false;
      return;
    }
    const t = setTimeout(() => void sincronizarPush(prefs), 800);
    return () => clearTimeout(t);
  }, [prefs, estado]);

  const zona = prefs.lat != null && prefs.lng != null ? { lat: prefs.lat, lng: prefs.lng, radioKm: prefs.radioKm } : null;
  const enZona = zona
    ? (snapshot?.emergencias ?? []).filter((e) => e.activa && e.lat != null && e.lng != null && prefs.categorias.includes(e.categoria) && distanciaKm(zona, { lat: e.lat, lng: e.lng }) <= zona.radioKm)
    : [];

  const activar = async () => {
    setOcupado(true);
    setMensaje(null);
    let p = prefs;
    if (p.lat == null && ubicacion) {
      p = { ...p, lat: ubicacion.lat, lng: ubicacion.lng };
      setPrefs({ lat: ubicacion.lat, lng: ubicacion.lng });
    }
    const r = await activarPush(p);
    setOcupado(false);
    if (r.ok) {
      setEstado("activo");
      setMensaje({ ok: true, txt: "Notificaciones activadas. Envía una prueba para confirmar." });
    } else {
      if (Notification.permission === "denied") setEstado("denegado");
      setMensaje({ ok: false, txt: r.error ?? "No se pudo activar." });
    }
  };

  const desactivar = async () => {
    setOcupado(true);
    await desactivarPush();
    setOcupado(false);
    setEstado("inactivo");
    setMensaje({ ok: true, txt: "Notificaciones desactivadas en este dispositivo." });
  };

  const probar = async () => {
    setOcupado(true);
    const ok = await probarPush();
    setOcupado(false);
    setMensaje(ok ? { ok: true, txt: "Prueba enviada. Debería llegar en unos segundos." } : { ok: false, txt: "No se pudo enviar la prueba." });
  };

  const toggleCat = (c: Categoria) =>
    setPrefs({ categorias: prefs.categorias.includes(c) ? prefs.categorias.filter((x) => x !== c) : [...prefs.categorias, c] });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-xl font-bold uppercase tracking-wide">Alertas</h1>

      {/* Estado de notificaciones */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${estado === "activo" ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted"}`}>
            {estado === "activo" ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {
                {
                  cargando: "Comprobando…",
                  no_soportado: "Sin soporte de notificaciones",
                  ios_instalar: "Instala la app primero",
                  denegado: "Notificaciones bloqueadas",
                  inactivo: "Notificaciones apagadas",
                  activo: "Notificaciones activas",
                }[estado]
              }
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {estado === "ios_instalar" && (
                <>
                  <Share className="inline size-3.5" /> Compartir → Agregar a inicio
                </>
              )}
              {estado === "denegado" && "Actívalas en los ajustes del teléfono"}
              {estado === "inactivo" && "Llegan aunque la app esté cerrada"}
              {estado === "activo" && "Los cambios se guardan solos"}
              {estado === "no_soportado" && "Usa Chrome en Android"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {estado === "inactivo" && (
            <button onClick={activar} disabled={ocupado} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-white disabled:opacity-50">
              {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <BellRing className="size-4" />} Activar notificaciones
            </button>
          )}
          {estado === "activo" && (
            <>
              <button onClick={probar} disabled={ocupado} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-3 px-4 font-semibold disabled:opacity-50">
                {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar prueba
              </button>
              <button onClick={desactivar} disabled={ocupado} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong px-4 font-semibold text-muted disabled:opacity-50">
                Desactivar
              </button>
            </>
          )}
        </div>
        {mensaje && (
          <p className={`mt-3 flex items-start gap-2 text-sm ${mensaje.ok ? "text-ok" : "text-warn"}`}>
            {mensaje.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            {mensaje.txt}
          </p>
        )}
        {servidor && !servidor.push.configurado && (
          <p className="mt-3 text-xs text-warn">El servidor no tiene claves VAPID configuradas (ver README).</p>
        )}
      </section>

      {/* Zona */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="p-4 pb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Zona de alerta</h2>
          <p className="mt-1 text-xs text-dim">{prefs.seguirUbicacion ? "Sigue tu ubicación" : "Toca el mapa para mover el punto"}</p>
        </div>
        <div className="h-64">
          <MapaDinamico
            ubicacion={ubicacion}
            zona={zona}
            centro={zona ? [zona.lat, zona.lng] : null}
            zoom={zoomPara(prefs.radioKm)}
            emergencias={enZona}
            onClickMapa={(lat, lng) => setPrefs({ lat, lng, seguirUbicacion: false })}
          />
        </div>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (ubicacion) setPrefs({ lat: ubicacion.lat, lng: ubicacion.lng, seguirUbicacion: true });
                else {
                  setPrefs({ seguirUbicacion: true });
                  pedirUbicacion();
                }
              }}
              className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${prefs.seguirUbicacion ? "bg-[#60a5fa]/15 text-[#93c5fd]" : "bg-surface-3"}`}
            >
              <Crosshair className="size-4" /> {prefs.seguirUbicacion ? "Siguiendo mi ubicación" : "Usar mi ubicación"}
            </button>
            {estadoUbicacion === "denegada" && <span className="self-center text-xs text-warn">Ubicación bloqueada en el navegador</span>}
          </div>

          <label className="block">
            <span className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">Radio</span>
              <span className="font-display text-xl font-bold tabular">{prefs.radioKm} km</span>
            </span>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={prefs.radioKm}
              onChange={(e) => setPrefs({ radioKm: Number(e.target.value) })}
              className="mt-2 w-full cursor-pointer accent-[#e8322b]"
            />
          </label>
          {zona && (
            <p className="text-xs text-dim">{enZona.length} activa{enZona.length === 1 ? "" : "s"} en tu zona ahora</p>
          )}
        </div>
      </section>

      {/* Tipos */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Tipos de emergencia</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ORDEN_CATEGORIAS.map((c) => {
            const on = prefs.categorias.includes(c);
            const info = CATEGORIAS[c];
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm font-medium transition-colors ${on ? "border-transparent bg-surface-3" : "border-line text-dim"}`}
                aria-pressed={on}
              >
                <IconoCategoria categoria={c} className="size-4" style={{ color: on ? info.color : undefined }} />
                <span className="flex-1">{info.corto}</span>
                <span className={`grid size-5 place-items-center rounded-md border ${on ? "border-transparent bg-accent text-white" : "border-line-strong"}`}>
                  {on && <Check className="size-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Compañía */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Mi compañía</h2>
        <p className="mt-1 text-xs text-dim">Aviso prioritario si la despachan o la llaman por radio</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-display text-2xl font-bold text-dim">B-</span>
          <input
            inputMode="numeric"
            value={prefs.compania ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPrefs({ compania: v ? Number(v) : null });
            }}
            placeholder="150"
            className="h-12 w-32 rounded-xl border border-line bg-surface-2 px-3 font-display text-2xl font-bold tabular placeholder:text-dim/50 focus:border-line-strong focus:outline-none"
            aria-label="Número de compañía"
          />
        </div>
      </section>

      {/* Avisos dentro de la app */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Con la app abierta</h2>
        <div className="mt-2 divide-y divide-line">
          <Interruptor icono={<Volume2 className="size-4" />} etiqueta="Tono de alerta" on={prefs.sonido} onChange={(v) => { setPrefs({ sonido: v }); if (v) tonoAlerta(); }} />
          <Interruptor icono={<Vibrate className="size-4" />} etiqueta="Vibración" on={prefs.vibracion} onChange={(v) => setPrefs({ vibracion: v })} />
        </div>
      </section>

      {servidor && (
        <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">
            <Smartphone className="size-4" /> Servicio
          </h2>
          <Linea ok={servidor.sgo.ok} txt={servidor.sgo.ok ? "SGO en línea" : "SGO sin respuesta"} />
          <Linea ok={servidor.ia.disponible} txt={servidor.ia.disponible ? "IA disponible" : "IA en pausa · guías automáticas"} />
          <Linea ok={servidor.push.configurado} txt={servidor.push.configurado ? "Notificaciones listas" : "Notificaciones sin configurar"} />
        </section>
      )}

      <Credito className="pt-2" />
    </div>
  );
}

function Interruptor({ icono, etiqueta, on, onChange }: { icono: React.ReactNode; etiqueta: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2.5">
      <span className="text-muted">{icono}</span>
      <span className="flex-1 text-sm font-medium">{etiqueta}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 rounded-full bg-surface-3 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
    </label>
  );
}

function Linea({ ok, txt }: { ok: boolean; txt: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5 text-muted">
      <span className={`size-2 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} />
      {txt}
    </p>
  );
}

function zoomPara(km: number) {
  if (km <= 2) return 14;
  if (km <= 5) return 13;
  if (km <= 10) return 12;
  if (km <= 20) return 11;
  return 10;
}
