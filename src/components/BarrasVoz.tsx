/** Indicador de transmisión: barras animadas cuando hay voz en el canal. */
export function BarrasVoz({ activo, className = "" }: { activo: boolean; className?: string }) {
  return (
    <span className={`inline-flex h-4 items-end gap-[3px] ${className}`} aria-label={activo ? "Transmitiendo" : "Sin transmisión"}>
      {[0, 0.2, 0.4, 0.1].map((d, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${activo ? "vu-bar bg-ok" : "bg-dim/60"}`}
          style={{ height: activo ? "100%" : `${30 + i * 10}%`, animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}
