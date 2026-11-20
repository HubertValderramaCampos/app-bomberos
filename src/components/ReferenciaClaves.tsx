"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, Search } from "lucide-react";
import { CLAVES, GRUPOS_CLAVES } from "@/lib/claves";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Glosario consultable de claves de radio del CGBVP (funciona sin conexión). */
export function ReferenciaClaves() {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");

  const grupos = useMemo(() => {
    const n = norm(q.trim()).replace(/[.\s]/g, "-");
    const lista = n ? CLAVES.filter((c) => c.codigo.toLowerCase().includes(n) || norm(c.significado).includes(norm(q.trim()))) : CLAVES;
    return GRUPOS_CLAVES.map((g) => ({ g, items: lista.filter((c) => c.grupo === g) })).filter((x) => x.items.length);
  }, [q]);

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={abierto}>
        <BookOpen className="size-4 text-warn" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">Claves de radio del CGBVP</span>
        <span className="ml-auto text-xs text-dim">{CLAVES.length}</span>
        <ChevronDown className={`size-4 text-dim transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="border-t border-line p-3">
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: 10-33, ubicación, incendio…"
              className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-sm placeholder:text-dim focus:outline-none"
            />
          </label>
          <div className="max-h-[28rem] space-y-4 overflow-y-auto scroll-thin">
            {grupos.map(({ g, items }) => (
              <div key={g}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{g}</h3>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {items.map((c) => (
                    <div key={c.codigo} className="flex gap-3 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2">
                      <dt className="w-12 shrink-0 font-mono font-semibold text-warn">{c.codigo}</dt>
                      <dd className="text-text/90">{c.significado}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {grupos.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
          </div>
          <p className="mt-3 text-[11px] text-dim">Fuente: lámina «Códigos de radio del CGBVP». Por radio se dicen «diez treinta y tres» (10-33).</p>
        </div>
      )}
    </section>
  );
}
