"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Emergencia } from "@/lib/types";
import { CATEGORIAS } from "@/lib/categorias";
import { horaLima } from "@/lib/tiempo";

export interface MapaProps {
  emergencias?: Emergencia[];
  ubicacion?: { lat: number; lng: number } | null;
  /** Centro inicial; si cambia, el mapa vuela hacia él */
  centro?: [number, number] | null;
  zoom?: number;
  seleccion?: string | null;
  zona?: { lat: number; lng: number; radioKm: number } | null;
  onClickMapa?: (lat: number, lng: number) => void;
  /** Ajustar la vista a las emergencias la primera vez */
  ajustar?: boolean;
  interactivo?: boolean;
  className?: string;
}

export const LIMA: [number, number] = [-12.0464, -77.0428];

const iconos = new Map<string, L.DivIcon>();
function iconoEmergencia(color: string, activa: boolean, grande: boolean) {
  const clave = `${color}-${activa}-${grande}`;
  let i = iconos.get(clave);
  if (!i) {
    const s = grande ? 22 : activa ? 16 : 11;
    i = L.divIcon({
      className: "",
      iconSize: [s, s],
      iconAnchor: [s / 2, s / 2],
      popupAnchor: [0, -s / 2],
      html: `<div class="marcador-emergencia" style="color:${color};width:${s}px;height:${s}px;opacity:${activa ? 1 : 0.55}">${
        activa ? '<span class="anillo"></span>' : ""
      }<span class="punto"></span></div>`,
    });
    iconos.set(clave, i);
  }
  return i;
}

const iconoYo = L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="marcador-yo"></div>' });

function Controlador({ centro, zoom, emergencias, ajustar, onClickMapa }: Pick<MapaProps, "centro" | "zoom" | "emergencias" | "ajustar" | "onClickMapa">) {
  const map = useMap();
  const ajustado = useRef(false);

  useMapEvents({
    click(e) {
      onClickMapa?.(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (centro) map.flyTo(centro, zoom ?? map.getZoom(), { duration: 0.6 });
  }, [centro?.[0], centro?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ajustar || ajustado.current || !emergencias?.length) return;
    const puntos = emergencias.filter((e) => e.activa && e.lat != null && e.lng != null).map((e) => [e.lat!, e.lng!] as [number, number]);
    if (puntos.length >= 2) {
      map.fitBounds(L.latLngBounds(puntos).pad(0.15), { maxZoom: 13 });
      ajustado.current = true;
    }
  }, [ajustar, emergencias, map]);

  // Leaflet calcula mal el tamaño si el contenedor cambia (p. ej. al alternar lista/mapa)
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  return null;
}

export default function Mapa({
  emergencias = [],
  ubicacion,
  centro,
  zoom = 12,
  seleccion,
  zona,
  onClickMapa,
  ajustar,
  interactivo = true,
  className = "",
}: MapaProps) {
  const inicial = useMemo<[number, number]>(() => centro ?? (ubicacion ? [ubicacion.lat, ubicacion.lng] : LIMA), []); // eslint-disable-line react-hooks/exhaustive-deps
  const conCoords = emergencias.filter((e) => e.lat != null && e.lng != null);
  // Las activas se dibujan encima de las cerradas
  const ordenadas = [...conCoords].sort((a, b) => Number(a.activa) - Number(b.activa));

  return (
    <MapContainer
      center={inicial}
      zoom={centro || ubicacion ? zoom : 11}
      className={`h-full w-full ${className}`}
      zoomControl={interactivo}
      dragging={interactivo}
      scrollWheelZoom={interactivo}
      doubleClickZoom={interactivo}
      touchZoom={interactivo}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        className="mapa-oscuro"
        maxZoom={19}
      />
      <Controlador centro={centro} zoom={zoom} emergencias={emergencias} ajustar={ajustar} onClickMapa={onClickMapa} />

      {zona && (
        <Circle
          center={[zona.lat, zona.lng]}
          radius={zona.radioKm * 1000}
          pathOptions={{ color: "#e8322b", weight: 1.5, fillColor: "#e8322b", fillOpacity: 0.08, dashArray: "6 6" }}
        />
      )}
      {ubicacion && <Marker position={[ubicacion.lat, ubicacion.lng]} icon={iconoYo} zIndexOffset={1000} />}

      {ordenadas.map((e) => {
        const cat = CATEGORIAS[e.categoria];
        return (
          <Marker
            key={e.parte}
            position={[e.lat!, e.lng!]}
            icon={iconoEmergencia(cat.color, e.activa, seleccion === e.parte)}
            zIndexOffset={seleccion === e.parte ? 900 : e.activa ? 500 : 0}
          >
            {interactivo && (
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-display text-[15px] font-bold uppercase leading-tight" style={{ color: cat.color }}>
                    {e.tipoPrincipal}
                  </p>
                  <p className="text-xs text-muted">{e.subtipo}</p>
                  <p className="mt-1.5 text-[13px]">{e.direccion}</p>
                  <p className="text-xs text-muted">
                    {e.distrito} · {horaLima(e.fecha)} · {e.estado}
                  </p>
                  {e.maquinas.length > 0 && <p className="mt-1 font-mono text-xs">{e.maquinas.join(" · ")}</p>}
                  <Link href={`/emergencia/${e.parte}`} className="mt-2 inline-block text-[13px] font-semibold !text-accent-strong">
                    Ver detalle →
                  </Link>
                </div>
              </Popup>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
