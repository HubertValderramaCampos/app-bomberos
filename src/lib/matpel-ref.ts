/**
 * Referencia rápida de materiales peligrosos frecuentes en el Perú.
 * Guía = número de guía de la GRE (Guía de Respuesta en caso de Emergencia, ERG 2024).
 *
 * Se usa para: (1) respuesta instantánea y sin conexión al escribir un N° ONU,
 * y (2) contrastar la respuesta de la IA — si el N° ONU coincide, la guía de esta
 * tabla tiene prioridad. Verificar siempre contra la GRE impresa/oficial.
 */
export interface MaterialRef {
  onu: string;
  nombre: string;
  guia: string;
  clase: string;
  alias?: string[];
}

export const MATERIALES: MaterialRef[] = [
  { onu: "1075", nombre: "Gas licuado de petróleo (GLP)", guia: "115", clase: "2.1", alias: ["glp", "gas doméstico", "balón de gas"] },
  { onu: "1978", nombre: "Propano", guia: "115", clase: "2.1" },
  { onu: "1011", nombre: "Butano", guia: "115", clase: "2.1" },
  { onu: "1971", nombre: "Gas natural comprimido (GNV)", guia: "115", clase: "2.1", alias: ["gnv", "metano comprimido"] },
  { onu: "1972", nombre: "Gas natural licuado (GNL)", guia: "115", clase: "2.1", alias: ["gnl"] },
  { onu: "1049", nombre: "Hidrógeno comprimido", guia: "115", clase: "2.1" },
  { onu: "1001", nombre: "Acetileno disuelto", guia: "116", clase: "2.1" },
  { onu: "1072", nombre: "Oxígeno comprimido", guia: "122", clase: "2.2 (5.1)", alias: ["oxigeno medicinal"] },
  { onu: "1073", nombre: "Oxígeno líquido refrigerado", guia: "122", clase: "2.2 (5.1)" },
  { onu: "1066", nombre: "Nitrógeno comprimido", guia: "121", clase: "2.2" },
  { onu: "1977", nombre: "Nitrógeno líquido refrigerado", guia: "120", clase: "2.2" },
  { onu: "1013", nombre: "Dióxido de carbono", guia: "120", clase: "2.2", alias: ["co2"] },
  { onu: "2187", nombre: "Dióxido de carbono líquido refrigerado", guia: "120", clase: "2.2" },
  { onu: "1005", nombre: "Amoníaco anhidro", guia: "125", clase: "2.3", alias: ["amoniaco"] },
  { onu: "1017", nombre: "Cloro", guia: "124", clase: "2.3", alias: ["cloro gas"] },
  { onu: "1050", nombre: "Cloruro de hidrógeno anhidro", guia: "125", clase: "2.3" },
  { onu: "1053", nombre: "Sulfuro de hidrógeno", guia: "117", clase: "2.3", alias: ["acido sulfhidrico", "h2s"] },
  { onu: "1016", nombre: "Monóxido de carbono comprimido", guia: "119", clase: "2.3", alias: ["co"] },
  { onu: "1040", nombre: "Óxido de etileno", guia: "119P", clase: "2.3" },
  { onu: "1086", nombre: "Cloruro de vinilo estabilizado", guia: "116P", clase: "2.1" },
  { onu: "1203", nombre: "Gasolina", guia: "128", clase: "3", alias: ["gasolina", "nafta"] },
  { onu: "1202", nombre: "Combustible diésel / Gasóleo", guia: "128", clase: "3", alias: ["diesel", "petróleo diésel"] },
  { onu: "1223", nombre: "Queroseno", guia: "128", clase: "3", alias: ["kerosene"] },
  { onu: "1863", nombre: "Combustible para aviones de turbina", guia: "128", clase: "3", alias: ["turbo a1", "jet a1"] },
  { onu: "1268", nombre: "Destilados de petróleo, n.e.p.", guia: "128", clase: "3" },
  { onu: "1993", nombre: "Líquido inflamable, n.e.p.", guia: "128", clase: "3" },
  { onu: "1263", nombre: "Pintura / material relacionado", guia: "128", clase: "3", alias: ["thinner", "laca"] },
  { onu: "1090", nombre: "Acetona", guia: "127", clase: "3" },
  { onu: "1170", nombre: "Etanol", guia: "127", clase: "3", alias: ["alcohol etilico"] },
  { onu: "1230", nombre: "Metanol", guia: "131", clase: "3 (6.1)", alias: ["alcohol metilico"] },
  { onu: "1219", nombre: "Isopropanol", guia: "129", clase: "3", alias: ["alcohol isopropilico"] },
  { onu: "1294", nombre: "Tolueno", guia: "130", clase: "3" },
  { onu: "1307", nombre: "Xilenos", guia: "130", clase: "3" },
  { onu: "1114", nombre: "Benceno", guia: "130", clase: "3" },
  { onu: "1950", nombre: "Aerosoles", guia: "126", clase: "2.1 / 2.2" },
  { onu: "1402", nombre: "Carburo de calcio", guia: "138", clase: "4.3" },
  { onu: "1942", nombre: "Nitrato de amonio", guia: "140", clase: "5.1" },
  { onu: "2067", nombre: "Fertilizante a base de nitrato de amonio", guia: "140", clase: "5.1" },
  { onu: "2014", nombre: "Peróxido de hidrógeno (20–60 %)", guia: "140", clase: "5.1 (8)", alias: ["agua oxigenada"] },
  { onu: "2015", nombre: "Peróxido de hidrógeno (> 60 %)", guia: "143", clase: "5.1 (8)" },
  { onu: "1689", nombre: "Cianuro de sodio", guia: "157", clase: "6.1" },
  { onu: "1680", nombre: "Cianuro de potasio", guia: "157", clase: "6.1" },
  { onu: "2209", nombre: "Formaldehído en solución", guia: "132", clase: "8", alias: ["formol"] },
  { onu: "2814", nombre: "Sustancia infecciosa (humanos)", guia: "158", clase: "6.2" },
  { onu: "3291", nombre: "Desechos clínicos / biomédicos", guia: "158", clase: "6.2" },
  { onu: "1830", nombre: "Ácido sulfúrico", guia: "137", clase: "8" },
  { onu: "1789", nombre: "Ácido clorhídrico", guia: "157", clase: "8", alias: ["acido muriatico"] },
  { onu: "2031", nombre: "Ácido nítrico", guia: "157", clase: "8" },
  { onu: "1052", nombre: "Fluoruro de hidrógeno anhidro", guia: "125", clase: "8 (6.1)" },
  { onu: "1824", nombre: "Hidróxido de sodio en solución", guia: "154", clase: "8", alias: ["soda caustica"] },
  { onu: "1791", nombre: "Hipoclorito en solución", guia: "154", clase: "8", alias: ["lejia", "legia"] },
  { onu: "1760", nombre: "Líquido corrosivo, n.e.p.", guia: "154", clase: "8" },
  { onu: "2794", nombre: "Baterías húmedas con ácido", guia: "154", clase: "8" },
  { onu: "3480", nombre: "Baterías de ion litio", guia: "147", clase: "9" },
  { onu: "3077", nombre: "Sustancia peligrosa para el medio ambiente, sólida", guia: "171", clase: "9" },
  { onu: "3082", nombre: "Sustancia peligrosa para el medio ambiente, líquida", guia: "171", clase: "9" },
];

/**
 * Distancias de la GRE 2024 (sección "Seguridad pública") para las guías más frecuentes.
 * Se imponen sobre lo que diga la IA: un error en estas cifras es crítico.
 * inicial = "como precaución inmediata, aislar…"; incendio = "si un tanque, carro tanque o
 * cisterna está involucrado en un incendio, aislar … en todas direcciones".
 */
const GASES = { inicial: "Aislar como mínimo 100 m en todas direcciones", incendio: 1600 };
const LIQUIDOS = { inicial: "Aislar como mínimo 50 m en todas direcciones", incendio: 800 };
const CORROSIVOS = { inicial: "Aislar como mínimo 50 m (líquidos) o 25 m (sólidos) en todas direcciones", incendio: 800 };

export const GRE_DISTANCIAS: Record<string, { inicial: string; incendio: number }> = {
  "115": GASES, "116": GASES, "117": GASES, "119": GASES, "124": GASES, "125": GASES,
  "127": LIQUIDOS, "128": LIQUIDOS, "129": LIQUIDOS, "130": LIQUIDOS, "131": LIQUIDOS, "132": LIQUIDOS,
  "154": CORROSIVOS, "157": CORROSIVOS,
};

export function distanciasGre(guia: string | null | undefined) {
  if (!guia) return null;
  return GRE_DISTANCIAS[guia.toUpperCase().replace("P", "")] ?? null;
}

export interface ClaseInfo {
  clase: string;
  nombre: string;
  color: string;
  texto: string;
  divisiones: string;
}

export const CLASES: ClaseInfo[] = [
  { clase: "1", nombre: "Explosivos", color: "#f97316", texto: "#111", divisiones: "1.1 – 1.6" },
  { clase: "2", nombre: "Gases", color: "#ef4444", texto: "#fff", divisiones: "2.1 inflamable · 2.2 no inflamable · 2.3 tóxico" },
  { clase: "3", nombre: "Líquidos inflamables", color: "#dc2626", texto: "#fff", divisiones: "Gasolina, diésel, alcoholes" },
  { clase: "4", nombre: "Sólidos inflamables", color: "#e11d48", texto: "#fff", divisiones: "4.1 sólido · 4.2 combustión espontánea · 4.3 peligroso al mojarse" },
  { clase: "5", nombre: "Oxidantes y peróxidos", color: "#facc15", texto: "#111", divisiones: "5.1 oxidante · 5.2 peróxido orgánico" },
  { clase: "6", nombre: "Tóxicos e infecciosos", color: "#f1f5f9", texto: "#111", divisiones: "6.1 tóxico · 6.2 infeccioso" },
  { clase: "7", nombre: "Radiactivos", color: "#fde047", texto: "#111", divisiones: "I · II · III (etiquetas)" },
  { clase: "8", nombre: "Corrosivos", color: "#1e293b", texto: "#fff", divisiones: "Ácidos y bases" },
  { clase: "9", nombre: "Misceláneos", color: "#e2e8f0", texto: "#111", divisiones: "Litio, ambientales, temperatura elevada" },
];

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function buscarPorOnu(onu: string | null | undefined): MaterialRef | null {
  if (!onu) return null;
  const n = onu.replace(/\D/g, "").padStart(4, "0");
  return MATERIALES.find((m) => m.onu === n) ?? null;
}

export function buscarLocal(consulta: string): MaterialRef[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const num = q.match(/\b(?:un|onu)?\s*(\d{4})\b/);
  if (num) {
    const m = buscarPorOnu(num[1]);
    if (m) return [m];
  }
  if (q.length < 3) return [];
  return MATERIALES.filter(
    (m) => normalizar(m.nombre).includes(q) || m.alias?.some((a) => normalizar(a).includes(q)),
  ).slice(0, 5);
}
