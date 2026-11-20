"use client";

import dynamic from "next/dynamic";
import type { MapaProps } from "./Mapa";

/** Leaflet usa `window`: se carga solo en el navegador. */
export const MapaDinamico = dynamic<MapaProps>(() => import("./Mapa"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-surface text-sm text-dim">Cargando mapa…</div>,
});
