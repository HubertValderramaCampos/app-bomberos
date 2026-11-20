"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AudioLines, Headphones, LoaderCircle, Megaphone, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { ListaTransmisiones } from "@/components/ListaTransmisiones";
import { ReferenciaClaves } from "@/components/ReferenciaClaves";
import { TablaEstaciones } from "@/components/TablaEstaciones";
import { CANALES, hablando, useRadio } from "@/components/providers/RadioProvider";
import { useAhora, useLive } from "@/components/providers/LiveProvider";
import { BarrasVoz } from "@/components/BarrasVoz";
import { hace, horaLima } from "@/lib/tiempo";

export default function RadioPage() {
  const r = useRadio();
  const { prefs, transmisiones, transcripcionHabilitada } = useLive();
  const ahora = useAhora(15_000);
  const { setObservando } = r;

  useEffect(() => {
    setObservando(true);
    document.title = "Radio en vivo · Alerta 116";
    return () => setObservando(false);
  }, [setObservando]);

  const voz = hablando(r.canal, r.actividad);
  const oyentes = r.servidor?.mounts[r.canal.mount];
  const enLinea = r.servidor ? r.canal.mount in r.servidor.mounts : null;
  const VolIcon = r.volumen === 0 ? VolumeX : r.volumen < 0.5 ? Volume1 : Volume2;
  const miCia = prefs.compania ? `B-${prefs.compania}` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Radio en vivo</h1>
        <p className="text-xs text-muted">Central de Emergencias · IV Comandancia Departamental Lima Centro</p>
      </div>

      {/* Reproductor principal */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-surface-2 to-surface p-6 text-center">
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${voz && r.reproduciendo ? "opacity-100" : "opacity-0"}`}
          style={{ background: "radial-gradient(circle at 50% 38%, rgb(34 197 94 / 0.16), transparent 60%)" }}
        />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-dim">{r.canal.frec}</p>
        <h2 className="relative mt-1 font-display text-3xl font-bold uppercase tracking-wide">{r.canal.nombre}</h2>
        <p className="relative text-sm text-muted">{r.canal.descripcion}</p>

        <button
          onClick={r.alternar}
          className={`relative mx-auto mt-6 grid size-28 place-items-center rounded-full text-white shadow-[0_10px_40px_-10px_rgb(232_50_43/0.8)] transition-transform active:scale-95 ${
            r.reproduciendo ? "bg-accent" : "bg-gradient-to-b from-accent-strong to-[#c81e1e]"
          }`}
          aria-label={r.reproduciendo ? "Pausar radio" : "Reproducir radio"}
        >
          {r.reproduciendo && voz && <span className="absolute inset-0 animate-ping-slow rounded-full border-2 border-ok/60" />}
          {r.cargando ? <LoaderCircle className="size-11 animate-spin" /> : r.reproduciendo ? <Pause className="size-11 fill-current" /> : <Play className="ml-1.5 size-11 fill-current" />}
        </button>

        <div className="relative mt-5 flex items-center justify-center gap-2 text-sm">
          <BarrasVoz activo={voz} />
          <span className={voz ? "font-semibold text-ok" : "text-muted"}>
            {voz ? "Transmisión en curso" : r.reproduciendo ? "En escucha · canal en silencio" : enLinea === false ? "Canal sin señal" : "Listo para escuchar"}
          </span>
        </div>
        {r.error && <p className="relative mt-2 text-sm text-warn">{r.error}</p>}

        <div className="relative mx-auto mt-5 flex max-w-xs items-center gap-3">
          <button onClick={() => r.setVolumen(r.volumen === 0 ? 1 : 0)} className="text-muted hover:text-text" aria-label="Silenciar">
            <VolIcon className="size-5" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={r.volumen}
            onChange={(e) => r.setVolumen(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[#e8322b]"
            aria-label="Volumen"
          />
          {oyentes != null && (
            <span className="flex items-center gap-1 text-xs text-dim tabular" title="Oyentes en este canal">
              <Headphones className="size-3.5" />
              {oyentes}
            </span>
          )}
        </div>
      </section>

      {/* Canales */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Canales</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CANALES.map((c) => {
            const sel = c.id === r.canal.id;
            const tx = hablando(c, r.actividad);
            const up = r.servidor ? c.mount in r.servidor.mounts : null;
            return (
              <button
                key={c.id}
                onClick={() => r.setCanal(c.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  sel ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong"
                } ${c.id === "scan" ? "col-span-2 sm:col-span-1" : ""}`}
                aria-pressed={sel}
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${tx ? "bg-ok shadow-[0_0_10px_2px_rgb(34_197_94/0.6)]" : up === false ? "bg-dim/40" : "bg-line-strong"}`}
                  title={tx ? "Transmitiendo" : up === false ? "Sin señal" : "En línea"}
                />
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold uppercase leading-none">{c.nombre}</span>
                  <span className="block truncate text-xs text-muted">{c.id === "c2" ? "Central · " : ""}{c.frec}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Transcripción en vivo */}
      {transcripcionHabilitada !== false && (
        <section className="rounded-2xl border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <AudioLines className="size-4 text-ok" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Transcripción en vivo · Canal 2 (Central)</h2>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-dim">
              <span className="size-1.5 animate-pulse rounded-full bg-ok" /> Whisper
            </span>
          </header>
          {transmisiones.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Esperando transmisiones de la Central… Cada comunicación aparece aquí transcrita y, cuando es posible, vinculada a su emergencia.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto scroll-thin">
              <ListaTransmisiones items={transmisiones.slice(0, 60)} />
            </div>
          )}
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-dim">
            Transcripción automática: puede confundir números, claves y nombres. Funciona aunque nadie tenga la radio abierta.
          </p>
        </section>
      )}

      {/* Selectivas */}
      <section className="rounded-2xl border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Megaphone className="size-4 text-accent-strong" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Selectivas recientes · Canal 2</h2>
          {miCia && <span className="ml-auto text-[11px] text-dim">Aviso para {miCia}</span>}
        </header>
        {r.selectivas.length === 0 ? (
          <p className="p-4 text-sm text-muted">Sin selectivas detectadas todavía.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto scroll-thin">
            {r.selectivas.map((s) => {
              const mia = miCia && s.cia === miCia;
              return (
                <li key={`${s.epoch}-${s.par}`} className={`flex items-center gap-3 px-4 py-2.5 ${mia ? "bg-accent/10" : ""}`}>
                  <span className="w-12 shrink-0 font-mono text-sm tabular text-muted">{horaLima(new Date(s.epoch * 1000).toISOString())}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`font-display text-lg font-bold uppercase leading-none ${s.cia ? (mia ? "text-accent-strong" : "") : "text-dim"}`}>
                        {s.cia ?? "No identificada"}
                      </span>
                      {s.origen === "inferida" && (
                        <span className="rounded-full bg-warn/15 px-1.5 py-px text-[10px] font-bold uppercase text-warn" title="Aprendida por correlación con partes y radio">
                          probable {s.confianza != null ? `${Math.round(s.confianza * 100)} %` : ""}
                        </span>
                      )}
                      {s.parte && (
                        <Link href={`/emergencia/${s.parte}`} className="rounded-full border border-line-strong px-1.5 py-px text-[10px] font-semibold text-muted hover:border-accent">
                          ver emergencia
                        </Link>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {s.nombre ? `${s.nombre} · ${s.distrito}` : <span className="font-mono text-dim">tonos {s.par}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-dim">{hace(new Date(s.epoch * 1000).toISOString(), ahora)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-dim">
          La selectiva es el par de tonos con el que la Central llama a una estación. Los pares desconocidos se aprenden solos
          cruzándolos con los partes del SGO y las transmisiones. Configura tu compañía en{" "}
          <Link href="/alertas" className="text-muted underline">Alertas</Link> para recibir un aviso cuando la llamen.
        </p>
      </section>

      <TablaEstaciones pares={r.pares} />

      <ReferenciaClaves />

      <p className="text-center text-[11px] leading-relaxed text-dim">
        Audio: Radio Bomberos Lima · IV CDLC (radio.lenznetwork.com). Cobertura principal: Lima Centro. La radio sigue sonando al
        cambiar de pantalla y desde la pantalla de bloqueo.
      </p>
    </div>
  );
}
