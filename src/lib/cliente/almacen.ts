"use client";

import { useSyncExternalStore } from "react";

/**
 * Valor persistido en localStorage y compartido entre componentes.
 * Con useSyncExternalStore el render del servidor usa el valor por defecto y el cliente
 * se sincroniza sin desajustes de hidratación.
 */
export function crearAlmacenLocal<T extends object>(clave: string, porDefecto: T) {
  let cache: T | null = null;
  const oyentes = new Set<() => void>();

  const leer = (): T => {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(clave);
      cache = raw ? { ...porDefecto, ...(JSON.parse(raw) as Partial<T>) } : porDefecto;
    } catch {
      cache = porDefecto;
    }
    return cache;
  };

  const actualizar = (parcial: Partial<T>) => {
    cache = { ...leer(), ...parcial };
    try {
      localStorage.setItem(clave, JSON.stringify(cache));
    } catch {
      /* almacenamiento bloqueado: el valor vive solo en memoria */
    }
    oyentes.forEach((o) => o());
  };

  const suscribir = (o: () => void) => {
    oyentes.add(o);
    return () => oyentes.delete(o);
  };

  const useValor = () => useSyncExternalStore(suscribir, leer, () => porDefecto);

  return { useValor, leer, actualizar };
}
