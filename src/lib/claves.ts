/**
 * Códigos de radio del CGBVP (fuente: lámina "Códigos de radio del CGBVP", compartida por el usuario,
 * es.slideshare.net/slideshow/claves-de-radio-bomberos/47331579). En la lámina se escriben "10.33";
 * por radio se dicen "diez treinta y tres" y Whisper los escribe "10-33". Aquí se normalizan a "10-33".
 * Ojo: la lámina es de ~2015; si alguna clave cambió, corregirla aquí.
 */
export interface Clave {
  codigo: string;
  significado: string;
  grupo: string;
}

const S = "Servicio";
const E = "Identificación de emergencias";
const SE = "Servicios especiales";
const J = "Jerarquías";
const CR = "Comando regional";
const C = "Compañía";
const L = "Locales";
const P = "Personal rentado";

const LISTA: [string, string, string][] = [
  ["10-01", "Adelante", S], ["10-02", "Operador de radio identifíquese", S], ["10-03", "Cambie frecuencia radial", S],
  ["10-04", "Llame por teléfono", S], ["10-05", "Comprendido", S], ["10-06", "Afirmativo", S],
  ["10-07", "Se dirige / Diríjase", S], ["10-08", "Repita mensaje", S], ["10-09", "Negativo", S],
  ["10-10", "Comunicación con…", S], ["10-11", "Al mando de la unidad", S], ["10-12", "Siga en escucha", S],
  ["10-13", "Derrotero", S], ["10-14", "Se consulta", S], ["10-15", "Efectivos", S],
  ["10-16", "Indique magnitud", S], ["10-17", "Informe novedades", S], ["10-18", "Dirección", S],
  ["10-19", "Ubicación", S], ["10-20", "En el lugar", S], ["10-21", "Línea privada", S],
  ["10-22", "En sintonía", S], ["10-23", "Se retira del lugar", S], ["10-24", "Urgente", S],
  ["10-25", "Emergencia confirmada", S], ["10-26", "En servicio", S], ["10-27", "Disponible", S],
  ["10-28", "Emergencia cancelada", S], ["10-29", "Continúe en alerta", S], ["10-30", "Ingresa a su base", S],
  ["10-31", "Traslado / transporte", S], ["10-32", "Emergencia en progreso", S], ["10-33", "Emergencia controlada", S],
  ["10-34", "Tome precauciones", S], ["10-35", "Requiere policía", S], ["10-36", "Fuera de sintonía", S],
  ["10-37", "Requiere empresa eléctrica", S], ["10-38", "Abastecimiento de…", S], ["10-39", "Fuera de servicio", S],
  ["10-40", "Espere órdenes", S], ["10-41", "Herido", S], ["10-42", "Muerto", S],
  ["10-43", "Herido FFAA/FFPP", S], ["10-44", "Paramédico", S], ["10-45", "Médico", S],
  ["10-46", "Enfermo", S], ["10-47", "No interrumpir", S], ["10-48", "Bombero piloto", S],
  ["10-49", "Piloto rentado", S], ["10-50", "En estado de alerta", S], ["10-51", "Parturienta", S],
  ["10-52", "Toque sirena", S], ["10-53", "Regrese a su base", S], ["10-54", "Prosiga la marcha", S],
  ["10-55", "Requiere empresa de saneamiento", S], ["10-56", "Deje sin efecto", S], ["10-57", "Utilice claves", S],
  ["10-58", "Fin de estado de alerta", S], ["10-59", "Guardia nocturna", S], ["10-60", "Tipo de emergencia", S],

  ["20-01", "Efectivo CGBVP accidentado", E], ["20-02", "Vehículo CGBVP accidentado", E],
  ["20-03", "Atentado / artefacto explosivo", E], ["20-04", "Atropellado", E], ["20-05", "Ascensor atrapado", E],
  ["20-06", "Inundación", E], ["20-07", "Falsa alarma", E], ["20-08", "Incendio vehicular", E],
  ["20-09", "Derrumbe", E], ["20-10", "Derrame de producto (indique)", E], ["20-11", "Material peligroso (indique)", E],
  ["20-12", "Fuga de gas", E], ["20-13", "Grifo / cisterna", E], ["20-14", "Incendio sin apoyo", E],
  ["20-15", "Incendio, 1 unidad de apoyo", E], ["20-16", "Incendio, 2 unidades de apoyo", E],
  ["20-17", "Incendio, más de 2 unidades de apoyo", E], ["20-18", "Incendio, más de 3 unidades de apoyo", E],
  ["20-19", "Catástrofe (orden 6-11 / 6-12)", E], ["20-20", "Incendio forestal", E], ["20-21", "Incendio en terreno baldío", E],
  ["20-22", "Cortocircuito", E], ["20-23", "Accidente vehicular", E], ["20-24", "Rescate / atrapados", E],
  ["20-25", "Huaico / erupción volcánica", E], ["20-26", "Evacuación / fumigación", E], ["20-27", "Poste eléctrico / aviso luminoso", E],

  ["30-30", "Otro servicio / servicio especial", SE], ["30-31", "Prácticas, charlas, simulacros, ceremonias", SE],
  ["30-32", "Eventos, conciertos, festivales", SE], ["30-33", "Abrir puertas", SE], ["30-34", "Colocar letreros / pancartas", SE],
  ["30-35", "Velorio / entierro", SE], ["30-36", "Apoyos sociales (agua, vacunación)", SE],

  ["30-11", "Primer jefe de compañía", C], ["30-12", "Segundo jefe de compañía", C],
  ["30-13", "Jefe de operaciones de emergencias", C], ["30-14", "Jefe de operaciones 1", C],
  ["30-15", "Jefe de operaciones 2", C], ["30-16", "Jefe de operaciones 3", C], ["30-17", "Jefe de administración", C],
  ["30-18", "Jefe de servicio", C], ["30-19", "Jefe de disciplina", C], ["30-22", "Médico de turno", C],

  ["3-01", "Brigadier General", J], ["3-02", "Brigadier Mayor", J], ["3-03", "Brigadier", J],
  ["3-04", "Teniente Brigadier", J], ["3-05", "Capitán", J], ["3-06", "Teniente", J],
  ["3-07", "Subteniente", J], ["3-08", "Seccionario", J], ["3-09", "Alumno", J],

  ["6-11", "Comandante regional", CR], ["6-12", "Vicecomandante regional", CR], ["6-13", "Inspector regional", CR],
  ["6-14", "Presidente del consejo de disciplina", CR], ["6-16", "Jefe de brigada", CR], ["6-17", "Jefe de personal", CR],
  ["6-19", "Jefe de logística y mantenimiento", CR], ["6-21", "Jefe de técnica", CR], ["6-22", "Jefe de sanidad regional", CR],
  ["6-25", "Jefe de RR. PP.", CR],

  ["X-6", "Comando regional", L], ["X-7", "Cuartel de compañía", L], ["X-14", "Domicilio", L], ["X-15", "Centro de trabajo", L],

  ["1-01", "Contador", P], ["1-02", "Secretaria", P], ["1-03", "Auxiliar de secretaría", P], ["1-04", "Chofer cuartelero", P],
  ["1-05", "Cuartelero", P], ["1-06", "Operador de radio", P], ["1-07", "Obrero", P], ["1-08", "Conserje", P], ["1-09", "Practicante", P],
];

export const CLAVES: Clave[] = LISTA.map(([codigo, significado, grupo]) => ({ codigo, significado, grupo }));
const POR_CODIGO = new Map(CLAVES.map((c) => [c.codigo, c]));

export const GRUPOS_CLAVES = [S, E, SE, C, J, CR, L, P];

// ── Reconocimiento en transcripciones ──────────────────────────────────────

const UNIDADES: Record<string, number> = {
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };

/** "diez treinta y tres" → "10 33" (solo para convertir claves dichas en palabras) */
function numerosEnPalabras(t: string): string {
  const pal = Object.keys(UNIDADES).join("|");
  const dec = Object.keys(DECENAS).join("|");
  return t
    .replace(new RegExp(`\\b(${dec})(?: y (${pal}))?\\b`, "g"), (_, d: string, u?: string) => String(DECENAS[d] + (u ? UNIDADES[u] : 0)))
    .replace(new RegExp(`\\b(${pal})\\b`, "g"), (u: string) => String(UNIDADES[u]));
}

/**
 * Claves mencionadas en un texto. Solo se buscan las series que se usan en operaciones
 * (10, 20, 30 y locales X) para no confundir direcciones o números de unidad con claves.
 */
export function clavesEnTexto(texto: string): Clave[] {
  const t = numerosEnPalabras(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  );
  const out = new Map<string, Clave>();
  // Sin letra/dígito/guion antes ("M10-1" es una unidad, no la clave 10-01) y sin coma como separador ("calle 10, 15 m")
  for (const m of t.matchAll(/(?<![\w-])(10|20|30|33)(?:\s*[-.]\s*|\s+)(\d{1,2})(?![\d-])/g)) {
    const serie = m[1] === "33" ? "30" : m[1]; // la lámina trae "33.12" por "30.12"
    const c = POR_CODIGO.get(`${serie}-${m[2].padStart(2, "0")}`);
    if (c) out.set(c.codigo, c);
  }
  for (const m of t.matchAll(/\b(?:x|equis)\s*-?\s*(6|7|14|15)\b/g)) {
    const c = POR_CODIGO.get(`X-${m[1]}`);
    if (c) out.set(c.codigo, c);
  }
  return [...out.values()];
}

/** Glosario compacto para los prompts de la IA. */
export function glosarioClaves(): string {
  return GRUPOS_CLAVES.map(
    (g) => `${g}: ${CLAVES.filter((c) => c.grupo === g).map((c) => `${c.codigo} ${c.significado}`).join("; ")}`,
  ).join("\n");
}
