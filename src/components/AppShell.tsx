"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Bell, Biohazard, Radio, Siren, X } from "lucide-react";
import { useLive } from "./providers/LiveProvider";
import { MiniReproductor } from "./MiniReproductor";

const NAV = [
  { href: "/", label: "En vivo", icon: Siren },
  { href: "/radio", label: "Radio", icon: Radio },
  { href: "/matpel", label: "MatPel", icon: Biohazard },
  { href: "/alertas", label: "Alertas", icon: Bell },
];

function activo(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/emergencia") : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { conexion, snapshot } = useLive();
  const enVivo = conexion === "en_vivo" && snapshot?.ok !== false;

  // iOS ignora user-scalable=no: bloquear el gesto de pellizco fuera del mapa
  useEffect(() => {
    const bloquear = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.(".leaflet-container")) e.preventDefault();
    };
    document.addEventListener("gesturestart", bloquear, { passive: false });
    document.addEventListener("gesturechange", bloquear, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", bloquear);
      document.removeEventListener("gesturechange", bloquear);
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1100] border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2.5 px-4">
          <Link href="/" className="pulsar flex items-center gap-2" aria-label="Alerta 116, inicio">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-b from-accent-strong to-[#c81e1e]">
              <svg viewBox="0 0 24 24" className="size-4 fill-white" aria-hidden>
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
            </span>
            <span className="font-display text-lg font-bold uppercase leading-none tracking-wide">Alerta 116</span>
          </Link>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${enVivo ? "bg-accent/15 text-accent-strong" : "bg-warn/15 text-warn"}`}
            aria-live="polite"
          >
            <span className="relative flex size-1.5">
              {enVivo && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-strong opacity-75" />}
              <span className={`relative inline-flex size-1.5 rounded-full ${enVivo ? "bg-accent-strong" : "bg-warn"}`} />
            </span>
            {enVivo ? "En vivo" : "Conectando"}
          </span>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activo(path, href) ? "bg-surface-2 text-text" : "text-muted hover:bg-surface hover:text-text"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <Avisos />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(var(--nav-h)+var(--safe-bottom)+88px)] pt-3 md:pb-28">
        {children}
      </main>

      <MiniReproductor />

      <nav
        className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-bg pb-[var(--safe-bottom)] md:hidden"
        aria-label="Principal"
      >
        <div className="grid h-[var(--nav-h)] grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = activo(path, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? "text-text" : "text-dim"}`}
              >
                <span className={`pulsar grid h-7 w-14 place-items-center rounded-full ${on ? "bg-accent/20" : ""}`}>
                  <Icon className={`size-[21px] ${on ? "text-accent-strong" : ""}`} strokeWidth={on ? 2.25 : 1.75} />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Avisos() {
  const { avisos, cerrarAviso } = useLive();
  if (!avisos.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+56px)] z-[1200] flex flex-col items-center gap-2 px-3" aria-live="assertive">
      {avisos.map((a) => (
        <div
          key={a.id}
          className="animar-entrada pointer-events-auto flex w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-2xl shadow-black/60"
        >
          <span className="w-1.5 shrink-0" style={{ background: a.color ?? "var(--color-accent)" }} />
          <Link href={a.href ?? "#"} onClick={() => cerrarAviso(a.id)} className="min-w-0 flex-1 px-3 py-2.5">
            <p className="font-display text-base font-bold uppercase leading-tight tracking-wide">{a.titulo}</p>
            {a.cuerpo && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{a.cuerpo}</p>}
          </Link>
          <button onClick={() => cerrarAviso(a.id)} className="px-3 text-dim hover:text-text" aria-label="Cerrar aviso">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
