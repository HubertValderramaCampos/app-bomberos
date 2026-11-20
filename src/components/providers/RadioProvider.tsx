"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "./LiveProvider";
import { tonoAlerta, vibrar } from "@/lib/cliente/sonido";
import { crearAlmacenLocal } from "@/lib/cliente/almacen";

/**
 * Radio de la Central de Emergencias — IV Comandancia Departamental Lima Centro.
 * Streams Icecast públicos de radio.lenznetwork.com (CORS abierto).
 */
export const RADIO_BASE = "https://radio.lenznetwork.com";

export interface Canal {
  id: string;
  nombre: string;
  corto: string;
  mount: string;
  frec: string;
  /** Id del receptor SDR en el feed de actividad ("C-2"), o null para el scan */
  sdr: string | null;
  descripcion: string;
}

export const CANALES: Canal[] = [
  { id: "scan", nombre: "Scan 1-4", corto: "SCAN", mount: "/todos.mp3", frec: "Todos", sdr: null, descripcion: "Todos los canales a la vez" },
  { id: "c2", nombre: "Canal 2", corto: "C2", mount: "/sdr-canal2.mp3", frec: "160.500 MHz", sdr: "C-2", descripcion: "Central de Emergencias — despacho" },
  { id: "c1", nombre: "Canal 1", corto: "C1", mount: "/sdr-canal1.mp3", frec: "160.625 MHz", sdr: "C-1", descripcion: "Operaciones" },
  { id: "c3", nombre: "Canal 3", corto: "C3", mount: "/canal3.mp3", frec: "160.000 MHz", sdr: "C-3", descripcion: "Cobertura local (Central / Jesús María)" },
  { id: "c4", nombre: "Canal 4", corto: "C4", mount: "/sdr-canal4.mp3", frec: "160.575 MHz", sdr: "C-4", descripcion: "Operaciones" },
];

export interface Selectiva {
  epoch: number;
  ts: string;
  cia: string | null;
  confirmada: boolean;
}

interface RadioCtx {
  canal: Canal;
  setCanal: (id: string) => void;
  reproduciendo: boolean;
  cargando: boolean;
  error: string | null;
  alternar: () => void;
  detener: () => void;
  volumen: number;
  setVolumen: (v: number) => void;
  /** Receptores con transmisión en curso: { "C-2": true } */
  actividad: Record<string, boolean>;
  /** Mounts en línea y oyentes, según status-json de Icecast */
  servidor: { ok: boolean; mounts: Record<string, number> } | null;
  selectivas: Selectiva[];
  /** Activa el sondeo de estado/actividad aunque no se esté reproduciendo (pantalla de radio abierta) */
  setObservando: (v: boolean) => void;
}

const Ctx = createContext<RadioCtx | null>(null);
const almacenRadio = crearAlmacenLocal("a116:radio", { canal: "scan", volumen: 1 });

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const { prefs, avisar } = useLive();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { canal: canalId, volumen } = almacenRadio.useValor();
  const setCanalId = useCallback((id: string) => almacenRadio.actualizar({ canal: id }), []);
  const setVolumenState = useCallback((v: number) => almacenRadio.actualizar({ volumen: v }), []);
  const [quiere, setQuiere] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actividad, setActividad] = useState<Record<string, boolean>>({});
  const [servidor, setServidor] = useState<RadioCtx["servidor"]>(null);
  const [selectivas, setSelectivas] = useState<Selectiva[]>([]);
  const [observando, setObservando] = useState(false);
  const intentos = useRef(0);
  /** Copia síncrona de "quiere": los eventos del <audio> llegan antes del re-render */
  const quiereRef = useRef(false);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaSel = useRef<number | null>(null);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const canal = CANALES.find((c) => c.id === canalId) ?? CANALES[0];

  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    audioRef.current = a;
    return () => {
      a.pause();
      a.removeAttribute("src");
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volumen;
  }, [volumen]);

  const arrancar = useCallback((c: Canal) => {
    const a = audioRef.current;
    if (!a) return;
    setCargando(true);
    setError(null);
    // Sin cache-buster el navegador reanuda un buffer viejo y el "vivo" llega con retraso.
    a.src = `${RADIO_BASE}${c.mount}?t=${Date.now()}`;
    a.volume = volumen;
    a.play()
      .then(() => {
        intentos.current = 0;
      })
      .catch((err: DOMException) => {
        if (err?.name === "AbortError") return;
        setCargando(false);
        if (err?.name === "NotAllowedError") {
          quiereRef.current = false;
          setQuiere(false);
          setError("Toca reproducir para iniciar el audio.");
        }
      });
  }, [volumen]);

  const parar = useCallback(() => {
    const a = audioRef.current;
    if (reintento.current) clearTimeout(reintento.current);
    reintento.current = null;
    if (!a) return;
    a.pause();
    a.removeAttribute("src");
    a.load(); // corta la descarga del stream
    setReproduciendo(false);
    setCargando(false);
  }, []);

  // Eventos del <audio>: estado y reconexión con espera creciente
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlaying = () => {
      setReproduciendo(true);
      setCargando(false);
      setError(null);
    };
    const onWaiting = () => setCargando(true);
    const onFallo = () => {
      setReproduciendo(false);
      if (!quiereRef.current || !a.getAttribute("src")) return;
      intentos.current++;
      const espera = Math.min(30_000, 1500 * 2 ** Math.min(intentos.current, 5));
      setError(intentos.current > 2 ? "Señal interrumpida, reconectando…" : null);
      if (reintento.current) clearTimeout(reintento.current);
      reintento.current = setTimeout(() => arrancar(canal), espera);
    };
    a.addEventListener("playing", onPlaying);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("error", onFallo);
    a.addEventListener("ended", onFallo);
    return () => {
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("error", onFallo);
      a.removeEventListener("ended", onFallo);
    };
  }, [canal, arrancar]);

  // Al volver a primer plano o recuperar red, se reengancha al vivo.
  useEffect(() => {
    const reenganchar = () => {
      if (!document.hidden && quiere && audioRef.current?.paused) arrancar(canal);
    };
    document.addEventListener("visibilitychange", reenganchar);
    window.addEventListener("online", reenganchar);
    return () => {
      document.removeEventListener("visibilitychange", reenganchar);
      window.removeEventListener("online", reenganchar);
    };
  }, [quiere, canal, arrancar]);

  const alternar = useCallback(() => {
    if (quiereRef.current) {
      quiereRef.current = false;
      setQuiere(false);
      parar();
    } else {
      quiereRef.current = true;
      setQuiere(true);
      arrancar(canal);
    }
  }, [canal, arrancar, parar]);

  const detener = useCallback(() => {
    quiereRef.current = false;
    setQuiere(false);
    parar();
  }, [parar]);

  const setCanal = useCallback(
    (id: string) => {
      const c = CANALES.find((x) => x.id === id);
      if (!c) return;
      setCanalId(id);
      if (quiereRef.current) arrancar(c);
    },
    [arrancar, setCanalId],
  );

  // Media Session: controles en pantalla de bloqueo y audio en segundo plano
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${canal.nombre} · ${canal.frec}`,
      artist: "Radio Bomberos · IV CDLC",
      album: "Alerta 116",
      artwork: [{ src: "/pwa-icon/512", sizes: "512x512", type: "image/png" }],
    });
    navigator.mediaSession.playbackState = reproduciendo ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => {
      quiereRef.current = true;
      setQuiere(true);
      arrancar(canal);
    });
    navigator.mediaSession.setActionHandler("pause", detener);
    navigator.mediaSession.setActionHandler("stop", detener);
  }, [canal, reproduciendo, arrancar, detener]);

  const activo = quiere || observando;

  // Actividad por canal (SSE del propio Icecast)
  useEffect(() => {
    if (!activo || typeof EventSource === "undefined") return;
    const es = new EventSource(`${RADIO_BASE}/actividad`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as { t: number; a: Record<string, number> };
        // Icecast reenvía eventos viejos al conectar: solo cuenta lo reciente.
        if (Date.now() / 1000 - d.t < 15) {
          setActividad(Object.fromEntries(Object.entries(d.a).map(([k, v]) => [k, v > 0])));
        }
      } catch {
        /* evento malformado */
      }
    };
    es.onerror = () => setActividad({});
    return () => {
      es.close();
      setActividad({});
    };
  }, [activo]);

  // Estado del servidor y selectivas detectadas (Canal 2)
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const estado = async () => {
      try {
        const r = await fetch(`${RADIO_BASE}/status-json.xsl`, { cache: "no-store" });
        const j = (await r.json()) as { icestats?: { source?: { listenurl?: string; listeners?: number } | { listenurl?: string; listeners?: number }[] } };
        const fuentes = ([] as { listenurl?: string; listeners?: number }[]).concat(j.icestats?.source ?? []);
        const mounts: Record<string, number> = {};
        for (const f of fuentes) {
          const m = String(f.listenurl ?? "").match(/(\/[^/]+)$/);
          if (m) mounts[m[1]] = Number(f.listeners ?? 0);
        }
        if (vivo) setServidor({ ok: true, mounts });
      } catch {
        if (vivo) setServidor({ ok: false, mounts: {} });
      }
    };
    const sel = async () => {
      try {
        const r = await fetch(`${RADIO_BASE}/selectivas.json`, { cache: "no-store" });
        const j = (await r.json()) as { selectivas?: { epoch: number; ts: string; cia: string | null; cia_origen: string | null }[] };
        const lista = (j.selectivas ?? [])
          .slice(-25)
          .reverse()
          .map((s) => ({ epoch: s.epoch, ts: s.ts, cia: s.cia, confirmada: s.cia_origen === "confirmado" }));
        if (!vivo) return;
        setSelectivas(lista);
        const ult = lista[0];
        if (!ult) return;
        if (ultimaSel.current === null) {
          ultimaSel.current = ult.epoch; // primera carga: solo tomar nota
          return;
        }
        if (ult.epoch > ultimaSel.current) {
          ultimaSel.current = ult.epoch;
          const mia = prefsRef.current.compania;
          if (mia && ult.cia === `B-${mia}` && Date.now() / 1000 - ult.epoch < 120) {
            avisar({ titulo: `Selectiva: la Central llama a B-${mia}`, cuerpo: "Canal 2 · Central de Emergencias", href: "/radio", color: "#e8322b", urgente: true });
            if (prefsRef.current.sonido) tonoAlerta(true);
            if (prefsRef.current.vibracion) vibrar(true);
          }
        }
      } catch {
        /* sin red: se reintenta */
      }
    };
    void estado();
    void sel();
    const t1 = setInterval(estado, 30_000);
    const t2 = setInterval(sel, 15_000);
    return () => {
      vivo = false;
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [activo, avisar]);

  const valor = useMemo<RadioCtx>(
    () => ({
      canal,
      setCanal,
      reproduciendo,
      cargando,
      error,
      alternar,
      detener,
      volumen,
      setVolumen: setVolumenState,
      actividad,
      servidor,
      selectivas,
      setObservando,
    }),
    [canal, setCanal, reproduciendo, cargando, error, alternar, detener, volumen, setVolumenState, actividad, servidor, selectivas],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRadio() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRadio debe usarse dentro de <RadioProvider>");
  return c;
}

/** ¿Hay transmisión en curso en el canal (o en cualquiera, para el scan)? */
export function hablando(canal: Canal, actividad: Record<string, boolean>) {
  return canal.sdr ? !!actividad[canal.sdr] : Object.values(actividad).some(Boolean);
}
