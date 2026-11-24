export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Estado en vivo de las unidades (SGO interno leído por el scraper, sin iniciar sesión aquí)
  const { iniciarUnidades } = await import("./lib/server/unidades");
  iniciarUnidades();
  // Monitor del SGO + notificaciones push
  if (process.env.MONITOR_DESACTIVADO !== "1") {
    const { getMonitor } = await import("./lib/server/monitor");
    getMonitor();
  }
  // Transcripción de la radio de la Central (Whisper)
  const { getTranscriptor, transcripcionHabilitada } = await import("./lib/server/radio/transcriptor");
  if (transcripcionHabilitada()) {
    getTranscriptor().iniciar();
    // Despachos por radio → emergencias provisionales ~3 min antes que el SGO
    if (process.env.RADIO_DESPACHOS !== "0") {
      const { getDespachos } = await import("./lib/server/radio/despachos");
      getDespachos().iniciar();
    }
  }
  // Selectivas por estación (no requiere IA)
  if (process.env.RADIO_SELECTIVAS !== "0") {
    const { getSelectivas } = await import("./lib/server/radio/selectivas");
    getSelectivas().iniciar();
  }
}
