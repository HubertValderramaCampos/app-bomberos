export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Monitor del SGO + notificaciones push
  if (process.env.MONITOR_DESACTIVADO !== "1") {
    const { getMonitor } = await import("./lib/server/monitor");
    getMonitor();
  }
  // Transcripción de la radio de la Central (Whisper)
  const { getTranscriptor, transcripcionHabilitada } = await import("./lib/server/radio/transcriptor");
  if (transcripcionHabilitada()) getTranscriptor().iniciar();
  // Selectivas por estación (no requiere IA)
  if (process.env.RADIO_SELECTIVAS !== "0") {
    const { getSelectivas } = await import("./lib/server/radio/selectivas");
    getSelectivas().iniciar();
  }
}
