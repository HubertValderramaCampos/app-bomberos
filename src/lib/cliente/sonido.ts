"use client";

let ctx: AudioContext | null = null;

function contexto() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Los navegadores exigen un gesto del usuario antes de reproducir audio: se "desbloquea" en el primer toque. */
export function desbloquearAudio() {
  const c = contexto();
  if (c && c.state === "suspended") void c.resume();
}

/** Tono de alerta de dos frecuencias (tipo pre-alerta), generado sin archivos. */
export function tonoAlerta(urgente = false) {
  const c = contexto();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime;
  const pasos = urgente ? [880, 660, 880, 660, 880] : [880, 660];
  pasos.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = f;
    const ini = t0 + i * 0.22;
    g.gain.setValueAtTime(0.0001, ini);
    g.gain.exponentialRampToValueAtTime(0.12, ini + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.2);
    o.connect(g).connect(c.destination);
    o.start(ini);
    o.stop(ini + 0.21);
  });
}

export function vibrar(urgente = false) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(urgente ? [300, 120, 300, 120, 600] : [200, 100, 200]);
  }
}
