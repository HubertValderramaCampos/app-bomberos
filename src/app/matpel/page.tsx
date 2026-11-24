"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Camera,
  ChevronDown,
  Droplets,
  ExternalLink,
  FireExtinguisher,
  Flame,
  HardHat,
  HeartPulse,
  ImagePlus,
  LoaderCircle,
  Ruler,
  ScanLine,
  Search,
  Stethoscope,
  TriangleAlert,
  X,
} from "lucide-react";
import type { MatpelResultado } from "@/lib/types";
import { buscarLocal, CLASES, MATERIALES, type MaterialRef } from "@/lib/matpel-ref";

export default function MatpelPage() {
  const [consulta, setConsulta] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<MatpelResultado | null>(null);
  const [verTabla, setVerTabla] = useState(false);
  const [filtroTabla, setFiltroTabla] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const resRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Materiales peligrosos · Alerta 116";
  }, []);

  const locales = useMemo(() => buscarLocal(consulta), [consulta]);

  const elegirImagen = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      setImagen(await redimensionar(f, 1600));
    } catch {
      setError("No se pudo leer la imagen.");
    }
  };

  const identificar = async (texto = consulta) => {
    if (!texto.trim() && !imagen) return;
    setCargando(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/ia/matpel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta: texto, imagen }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error al identificar");
      setRes(d as MatpelResultado);
      setTimeout(() => resRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  const tabla = useMemo(() => {
    const q = filtroTabla.trim().toLowerCase();
    return q ? MATERIALES.filter((m) => m.onu.includes(q) || m.nombre.toLowerCase().includes(q) || m.alias?.some((a) => a.includes(q))) : MATERIALES;
  }, [filtroTabla]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-xl font-bold uppercase tracking-wide">
        MatPel <span className="text-sm font-semibold normal-case tracking-normal text-dim">· N° ONU, nombre o placa</span>
      </h1>

      {/* Consulta */}
      <section className="rounded-2xl border border-line bg-surface p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void identificar();
          }}
          className="space-y-3"
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-5 text-dim" />
            <textarea
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void identificar();
                }
              }}
              rows={2}
              placeholder="Ej.: 1075 · cloro · placa roja con número 1203 · rombo NFPA 3-4-0 · cisterna con olor a huevo podrido"
              className="w-full resize-none rounded-xl border border-line bg-surface-2 py-3 pl-10 pr-3 text-[15px] placeholder:text-dim focus:border-line-strong focus:outline-none"
            />
          </label>

          {imagen && (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagen} alt="Foto adjunta" className="h-28 rounded-xl border border-line object-cover" />
              <button
                type="button"
                onClick={() => setImagen(null)}
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-line-strong bg-surface-3"
                aria-label="Quitar foto"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void elegirImagen(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 font-semibold active:scale-[0.98]"
            >
              {imagen ? <ImagePlus className="size-5" /> : <Camera className="size-5" />}
              <span className="hidden sm:inline">{imagen ? "Cambiar foto" : "Foto"}</span>
            </button>
            <button
              type="submit"
              disabled={cargando || (!consulta.trim() && !imagen)}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white disabled:opacity-40 active:scale-[0.98]"
            >
              {cargando ? <LoaderCircle className="size-5 animate-spin" /> : <ScanLine className="size-5" />}
              {cargando ? "Analizando…" : "Identificar con IA"}
            </button>
          </div>
        </form>

        {/* Coincidencias locales instantáneas (funcionan sin conexión) */}
        {locales.length > 0 && !res && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Referencia rápida (sin conexión)</p>
            {locales.map((m) => (
              <FilaMaterial key={m.onu} m={m} onClick={() => void identificar(`ONU ${m.onu} ${m.nombre}`)} />
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          {error}
        </div>
      )}

      {res && (
        <div ref={resRef} className="scroll-mt-20">
          <Resultado r={res} />
        </div>
      )}

      {/* Clases de riesgo */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Clases de riesgo ONU</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CLASES.map((c) => (
            <div key={c.clase} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
              <span className="grid size-11 shrink-0 rotate-45 place-items-center rounded-md border-2 border-black/40" style={{ background: c.color }}>
                <span className="-rotate-45 font-display text-xl font-bold" style={{ color: c.texto }}>
                  {c.clase}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{c.nombre}</span>
                <span className="block text-xs leading-snug text-muted">{c.divisiones}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Tabla de referencia */}
      <section className="rounded-2xl border border-line bg-surface">
        <button onClick={() => setVerTabla((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Materiales frecuentes · N° ONU y guía GRE</span>
          <span className="ml-auto text-xs text-dim">{MATERIALES.length}</span>
          <ChevronDown className={`size-4 text-dim transition-transform ${verTabla ? "rotate-180" : ""}`} />
        </button>
        {verTabla && (
          <div className="border-t border-line p-3">
            <input
              value={filtroTabla}
              onChange={(e) => setFiltroTabla(e.target.value)}
              placeholder="Filtrar por número o nombre"
              className="mb-2 h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm placeholder:text-dim focus:outline-none"
            />
            <div className="max-h-96 space-y-1.5 overflow-y-auto scroll-thin">
              {tabla.map((m) => (
                <FilaMaterial key={m.onu} m={m} onClick={() => void identificar(`ONU ${m.onu} ${m.nombre}`)} />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-muted">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-text">
          <TriangleAlert className="size-4 text-warn" /> Uso responsable
        </p>
        La identificación con IA es una ayuda para la respuesta inicial y puede equivocarse. Confirma siempre con la GRE 2024, la hoja de
        datos de seguridad (HDS) del producto y el oficial al mando. Si no hay certeza, trata el material como desconocido: aísla,
        aproxímate con el viento a favor y desde terreno alto.{" "}
        <a
          href="https://www.phmsa.dot.gov/hazmat/erg/emergency-response-guidebook-erg"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 font-semibold text-text underline"
        >
          GRE oficial <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function FilaMaterial({ m, onClick }: { m: MaterialRef; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-2 text-left hover:bg-surface-3">
      <PlacaOnu onu={m.onu} pequena />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{m.nombre}</span>
        <span className="block text-xs text-muted">Clase {m.clase}</span>
      </span>
      <GuiaBadge guia={m.guia} />
    </button>
  );
}

function PlacaOnu({ onu, pequena }: { onu: string; pequena?: boolean }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[3px] border-black font-mono font-bold text-black ${
        pequena ? "h-8 w-14 border-2 text-sm" : "h-12 w-24 border-[3px] text-2xl"
      }`}
      style={{ background: "#f97316" }}
      aria-label={`Número ONU ${onu}`}
    >
      {onu}
    </span>
  );
}

function GuiaBadge({ guia, grande }: { guia: string; grande?: boolean }) {
  return (
    <span className={`shrink-0 rounded-lg border border-line-strong bg-bg text-center ${grande ? "px-3 py-1.5" : "px-2 py-1"}`}>
      <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-dim">Guía GRE</span>
      <span className={`block font-mono font-bold leading-none text-warn ${grande ? "text-2xl" : "text-base"}`}>{guia}</span>
    </span>
  );
}

function RomboNfpa({ n }: { n: MatpelResultado["nfpa"] }) {
  if (n.salud == null && n.inflamabilidad == null && n.reactividad == null) return null;
  const celda = (valor: number | string | null, bg: string, color = "#fff") => (
    <span className="grid place-items-center border border-black/60" style={{ background: bg }}>
      <span className="-rotate-45 font-display text-lg font-bold" style={{ color }}>
        {valor ?? "–"}
      </span>
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid size-[60px] rotate-45 grid-cols-2 grid-rows-2 overflow-hidden rounded-sm" aria-label="Rombo NFPA 704">
        {celda(n.inflamabilidad, "#dc2626")}
        {celda(n.reactividad, "#facc15", "#111")}
        {celda(n.salud, "#2563eb")}
        {celda(n.especial ?? "", "#f8fafc", "#111")}
      </div>
      <span className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-dim">NFPA 704</span>
    </div>
  );
}

function Resultado({ r }: { r: MatpelResultado }) {
  const conf = { alta: "bg-ok/15 text-ok", media: "bg-warn/15 text-warn", baja: "bg-accent/20 text-accent-strong" }[r.confianza];
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="h-1.5 bg-gradient-to-r from-[#f97316] via-[#facc15] to-[#f97316]" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${conf}`}>
                {r.identificado ? `Confianza ${r.confianza}` : "No identificado con certeza"}
              </span>
              {r.referencia_local && <span className="rounded-full bg-surface-3 px-2 py-px text-[10px] font-semibold uppercase text-muted">Guía verificada con tabla</span>}
            </div>
            <h2 className="mt-1.5 font-display text-[26px] font-bold uppercase leading-tight tracking-wide">{r.nombre ?? "Material no identificado"}</h2>
            {r.sinonimos.length > 0 && <p className="text-sm text-muted">{r.sinonimos.join(" · ")}</p>}
            {r.clase && <p className="mt-1 text-sm">Clase {r.clase}</p>}
          </div>
          <div className="flex items-center gap-3">
            {r.numero_onu && <PlacaOnu onu={r.numero_onu} />}
            {r.guia_gre && <GuiaBadge guia={r.guia_gre} grande />}
            <RomboNfpa n={r.nfpa} />
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-text/90">{r.descripcion}</p>

        {r.advertencias.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-accent/40 bg-accent/10 p-3">
            {r.advertencias.map((a, i) => (
              <p key={i} className="flex gap-2 text-sm font-medium">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                {a}
              </p>
            ))}
          </div>
        )}

        {r.observaciones_imagen && (
          <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
            <Camera className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold text-text">En la imagen: </span>
              {r.observaciones_imagen}
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Seccion icono={<Ruler className="size-4" />} titulo="Aislamiento y evacuación" items={r.aislamiento} color="#ef4444" />
          <Seccion icono={<HardHat className="size-4" />} titulo="EPP" items={r.epp} color="#eab308" />
          <Seccion icono={<Flame className="size-4" />} titulo="Incendio / explosión" items={r.riesgos_incendio} color="#f97316" />
          <Seccion icono={<HeartPulse className="size-4" />} titulo="Riesgos para la salud" items={r.riesgos_salud} color="#ec4899" />
          <Seccion icono={<FireExtinguisher className="size-4" />} titulo="Control de incendio" items={r.control_incendio} color="#f97316" />
          <Seccion icono={<Droplets className="size-4" />} titulo="Derrame o fuga" items={r.derrame_fuga} color="#22d3ee" />
          <Seccion icono={<Stethoscope className="size-4" />} titulo="Primeros auxilios" items={r.primeros_auxilios} color="#3b82f6" />
          <Seccion icono={<Ban className="size-4" />} titulo="Incompatibilidades" items={r.incompatibilidades} color="#a855f7" />
        </div>

        <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
          Generado con IA. Verifica con la GRE {r.guia_gre ? `(guía ${r.guia_gre})` : ""} y la HDS antes de actuar.
        </p>
      </div>
    </section>
  );
}

function Seccion({ icono, titulo, items, color }: { icono: React.ReactNode; titulo: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide" style={{ color }}>
        {icono}
        {titulo}
      </h3>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reduce la foto en el navegador (menos datos móviles y respuesta más rápida). */
async function redimensionar(file: File, max: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const escala = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
