/** Perú no usa horario de verano: siempre UTC-5. */
export const TZ = "America/Lima";

/**
 * Convierte "20/11/2026 12:24:03 p.m." (formato SGO) a ISO "2026-11-20T12:24:03-05:00".
 */
export function parseFechaSgo(texto: string): string | null {
  const m = texto
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?/i);
  if (!m) return null;
  const [, d, mo, y, hh, mi, ss = "00", ap] = m;
  let h = Number(hh);
  if (ap) {
    const pm = ap.toLowerCase() === "p";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const p = (n: number | string) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(ss)}-05:00`;
}

export function horaLima(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fechaHoraLima(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function hace(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `hace ${h} h ${rm} min` : `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** "1:07:32" — tiempo transcurrido desde el despacho */
export function cronometro(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}
