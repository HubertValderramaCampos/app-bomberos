const g = globalThis as unknown as { __rl?: Map<string, number[]> };
const hits = (g.__rl ??= new Map());

/** Límite simple por ventana deslizante en memoria. Devuelve true si se permite. */
export function permitir(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const lista = (hits.get(clave) ?? []).filter((t: number) => ahora - t < ventanaMs);
  if (lista.length >= max) {
    hits.set(clave, lista);
    return false;
  }
  lista.push(ahora);
  hits.set(clave, lista);
  if (hits.size > 5000) hits.delete(hits.keys().next().value!);
  return true;
}

export function ipDe(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}
