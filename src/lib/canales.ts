/** Canales de la radio de la IV CDLC por id de receptor SDR (el que usa el feed /actividad). */
export const CANALES_RADIO: Record<string, { nombre: string; corto: string; mount: string; frec: string; rol: string }> = {
  "C-2": { nombre: "Canal 2 · Central", corto: "C2", mount: "/sdr-canal2.mp3", frec: "160.500 MHz", rol: "Central de Emergencias: despacho" },
  "C-1": { nombre: "Canal 1", corto: "C1", mount: "/sdr-canal1.mp3", frec: "160.625 MHz", rol: "Operaciones" },
  "C-3": { nombre: "Canal 3", corto: "C3", mount: "/canal3.mp3", frec: "160.000 MHz", rol: "Cobertura local (Central / Jesús María)" },
  "C-4": { nombre: "Canal 4", corto: "C4", mount: "/sdr-canal4.mp3", frec: "160.575 MHz", rol: "Operaciones" },
};

export const nombreCanal = (id: string) => CANALES_RADIO[id]?.nombre ?? id;
export const cortoCanal = (id: string) => CANALES_RADIO[id]?.corto ?? id;
