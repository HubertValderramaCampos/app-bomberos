import fs from "node:fs";
import path from "node:path";

/**
 * Almacenamiento JSON en disco con caché en memoria y escritura diferida y atómica.
 * Suficiente para un solo servidor; para escalar horizontalmente, migrar a Postgres.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

type Entrada<T> = { valor: T; timer: NodeJS.Timeout | null };

const g = globalThis as unknown as { __stores?: Map<string, Entrada<unknown>> };
const stores = (g.__stores ??= new Map());

export function leer<T>(nombre: string, porDefecto: T): T {
  const e = stores.get(nombre);
  if (e) return e.valor as T;
  let valor = porDefecto;
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, `${nombre}.json`), "utf8");
    valor = JSON.parse(raw) as T;
  } catch {
    /* archivo inexistente o corrupto: se usa el valor por defecto */
  }
  stores.set(nombre, { valor, timer: null });
  return valor;
}

export function guardar<T>(nombre: string, valor: T) {
  const e = (stores.get(nombre) as Entrada<T> | undefined) ?? { valor, timer: null };
  e.valor = valor;
  stores.set(nombre, e as Entrada<unknown>);
  if (e.timer) return;
  e.timer = setTimeout(() => {
    e.timer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const destino = path.join(DATA_DIR, `${nombre}.json`);
      const tmp = `${destino}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(e.valor));
      fs.renameSync(tmp, destino);
    } catch (err) {
      console.error(`[store] no se pudo guardar ${nombre}:`, err);
    }
  }, 500);
}
