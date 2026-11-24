/** Firma del desarrollador. Abre el sitio fuera de la app. */
export function Credito({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://www.llamasolutions.pe"
      target="_blank"
      rel="noopener"
      className={`pulsar block text-center text-[11px] text-dim ${className}`}
    >
      Desarrollado por <span className="font-semibold text-muted">www.llamasolutions.pe</span>
    </a>
  );
}
