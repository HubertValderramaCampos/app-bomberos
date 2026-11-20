"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Emergencia, PrefsAlertas, Snapshot, Transmision } from "@/lib/types";
import { PREFS_DEFAULT } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { distanciaKm, formatoDistancia } from "@/lib/geo";
import { desbloquearAudio, tonoAlerta, vibrar } from "@/lib/cliente/sonido";
import { registrarSW, sincronizarPush, suscripcionActual } from "@/lib/cliente/push";
import { crearAlmacenLocal } from "@/lib/cliente/almacen";

export type Conexion = "conectando" | "en_vivo" | "reconectando";
export type EstadoUbicacion = "inactiva" | "solicitando" | "activa" | "denegada" | "no_disponible";

export interface Ubicacion {
  lat: number;
  lng: number;
  precision: number;
}

export interface Aviso {
  id: string;
  titulo: string;
  cuerpo?: string;
  href?: string;
  color?: string;
  urgente?: boolean;
}

interface LiveCtx {
  snapshot: Snapshot | null;
  conexion: Conexion;
  ubicacion: Ubicacion | null;
  estadoUbicacion: EstadoUbicacion;
  pedirUbicacion: () => void;
  prefs: PrefsAlertas;
  setPrefs: (p: Partial<PrefsAlertas>) => void;
  /** Partes aparecidos durante esta sesión (para resaltarlos) */
  recientes: Set<string>;
  avisos: Aviso[];
  avisar: (a: Omit<Aviso, "id">) => void;
  cerrarAviso: (id: string) => void;
  distanciaA: (e: Pick<Emergencia, "lat" | "lng">) => number | null;
  /** Transcripciones de la radio de la Central, más nuevas primero */
  transmisiones: Transmision[];
  transcripcionHabilitada: boolean | null;
}

const Ctx = createContext<LiveCtx | null>(null);

const almacenPrefs = crearAlmacenLocal<PrefsAlertas>("a116:prefs", PREFS_DEFAULT);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [conexion, setConexion] = useState<Conexion>("conectando");
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [estadoUbicacion, setEstadoUbicacion] = useState<EstadoUbicacion>("inactiva");
  const prefs = almacenPrefs.useValor();
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [transmisiones, setTransmisiones] = useState<Transmision[]>([]);
  const [transcripcionHabilitada, setTranscripcionHabilitada] = useState<boolean | null>(null);

  const prefsRef = useRef(prefs);
  const ubicacionRef = useRef(ubicacion);
  const watchId = useRef<number | null>(null);
  const ultimaSync = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    ubicacionRef.current = ubicacion;
  }, [ubicacion]);

  // Service worker + desbloqueo de audio en el primer toque
  useEffect(() => {
    void registrarSW();
    const unlock = () => desbloquearAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const setPrefs = useCallback((p: Partial<PrefsAlertas>) => almacenPrefs.actualizar(p), []);

  const avisar = useCallback((a: Omit<Aviso, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAvisos((prev) => [{ ...a, id }, ...prev].slice(0, 4));
    setTimeout(() => setAvisos((prev) => prev.filter((x) => x.id !== id)), a.urgente ? 20_000 : 9_000);
  }, []);

  const cerrarAviso = useCallback((id: string) => setAvisos((prev) => prev.filter((x) => x.id !== id)), []);

  const distanciaA = useCallback(
    (e: Pick<Emergencia, "lat" | "lng">) =>
      ubicacion && e.lat != null && e.lng != null ? distanciaKm(ubicacion, { lat: e.lat, lng: e.lng }) : null,
    [ubicacion],
  );

  // ── Ubicación ──────────────────────────────────────────────────────────────
  const iniciarWatch = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setEstadoUbicacion("no_disponible");
      return;
    }
    if (watchId.current !== null) return;
    setEstadoUbicacion("solicitando");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy });
        setEstadoUbicacion("activa");
      },
      (err) => {
        setEstadoUbicacion(err.code === err.PERMISSION_DENIED ? "denegada" : "no_disponible");
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    // Si el permiso ya fue concedido antes, activamos la ubicación sin preguntar.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((st) => {
        if (st.state === "granted") iniciarWatch();
        else if (st.state === "denied") setEstadoUbicacion("denegada");
      })
      .catch(() => {});
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [iniciarWatch]);

  // Con "seguir mi ubicación", la zona de alertas push se actualiza al moverse > 500 m.
  useEffect(() => {
    if (!ubicacion || !prefs.seguirUbicacion) return;
    const u = ultimaSync.current;
    if (u && distanciaKm(u, ubicacion) < 0.5) return;
    ultimaSync.current = { lat: ubicacion.lat, lng: ubicacion.lng };
    const nuevas = { ...prefs, lat: ubicacion.lat, lng: ubicacion.lng };
    setPrefs({ lat: ubicacion.lat, lng: ubicacion.lng });
    void suscripcionActual().then((s) => s && sincronizarPush(nuevas, s));
  }, [ubicacion, prefs, setPrefs]);

  // ── Tiempo real (SSE) ──────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let errores = 0;

    const cargar = () =>
      fetch("/api/emergencias", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: Snapshot) => setSnapshot(s))
        .catch(() => {});

    const alNueva = (e: Emergencia) => {
      setRecientes((prev) => new Set(prev).add(e.parte));
      const p = prefsRef.current;
      const u = ubicacionRef.current;
      const esMiCompania = p.compania != null && e.companias.includes(p.compania);
      const km = u && e.lat != null && e.lng != null ? distanciaKm(u, { lat: e.lat, lng: e.lng }) : null;
      const cercana = km != null && km <= p.radioKm && p.categorias.includes(e.categoria);
      if (!esMiCompania && !cercana) return;
      const urgente = esMiCompania || e.categoria === "incendio" || e.categoria === "matpel";
      avisar({
        titulo: esMiCompania
          ? `B-${p.compania} despachada · ${e.tipoPrincipal}`
          : `${CATEGORIAS[e.categoria].corto} a ${formatoDistancia(km!)} · ${e.distrito}`,
        cuerpo: `${e.subtipo || e.tipo} — ${e.direccion}`,
        href: `/emergencia/${e.parte}`,
        color: CATEGORIAS[e.categoria].color,
        urgente,
      });
      if (p.sonido) tonoAlerta(urgente);
      if (p.vibracion) vibrar(urgente);
    };

    const conectar = () => {
      es = new EventSource("/api/stream");
      es.addEventListener("open", () => {
        errores = 0;
        setConexion("en_vivo");
        if (fallback) {
          clearInterval(fallback);
          fallback = null;
        }
      });
      es.addEventListener("snapshot", (ev) => setSnapshot(JSON.parse((ev as MessageEvent).data)));
      es.addEventListener("estado", (ev) => {
        const d = JSON.parse((ev as MessageEvent).data) as Omit<Snapshot, "emergencias">;
        setSnapshot((prev) => (prev ? { ...prev, ...d } : prev));
      });
      es.addEventListener("nueva", (ev) => alNueva(JSON.parse((ev as MessageEvent).data)));
      // Nueva transmisión o vinculación posterior: se reemplaza por id
      es.addEventListener("transmision", (ev) => {
        const tx = JSON.parse((ev as MessageEvent).data) as Transmision;
        setTransmisiones((prev) => [tx, ...prev.filter((x) => x.id !== tx.id)].sort((a, b) => b.ini.localeCompare(a.ini)).slice(0, 150));
      });
      es.addEventListener("error", () => {
        errores++;
        setConexion("reconectando");
        // Si SSE falla repetidamente (proxy que corta streams), caemos a sondeo cada 30 s.
        if (errores >= 3 && !fallback) {
          void cargar();
          fallback = setInterval(cargar, 30_000);
        }
      });
    };

    conectar();
    fetch("/api/radio/transcripciones")
      .then((r) => r.json())
      .then((d: { habilitada: boolean; transmisiones: Transmision[] }) => {
        setTranscripcionHabilitada(d.habilitada);
        setTransmisiones((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          return [...prev, ...d.transmisiones.filter((x) => !ids.has(x.id))].sort((a, b) => b.ini.localeCompare(a.ini)).slice(0, 150);
        });
      })
      .catch(() => {});
    return () => {
      es?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [avisar]);

  const valor = useMemo<LiveCtx>(
    () => ({
      snapshot,
      conexion,
      ubicacion,
      estadoUbicacion,
      pedirUbicacion: iniciarWatch,
      prefs,
      setPrefs,
      recientes,
      avisos,
      avisar,
      cerrarAviso,
      distanciaA,
      transmisiones,
      transcripcionHabilitada,
    }),
    [snapshot, conexion, ubicacion, estadoUbicacion, iniciarWatch, prefs, setPrefs, recientes, avisos, avisar, cerrarAviso, distanciaA, transmisiones, transcripcionHabilitada],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useLive() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLive debe usarse dentro de <LiveProvider>");
  return c;
}

/** Re-render periódico para tiempos relativos ("hace 3 min"). */
export function useAhora(intervaloMs = 15_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return ahora;
}
