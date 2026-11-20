/** Ícono de marca: llama blanca sobre rojo bomberil. Se usa para favicon, apple-icon y PWA. */
export function IconoMarca({ size, maskable = false }: { size: number; maskable?: boolean }) {
  const llama = Math.round(size * (maskable ? 0.46 : 0.6));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #ff4a3d 0%, #c81e1e 100%)",
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={llama} height={llama} viewBox="0 0 24 24" fill="#fff">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    </div>
  );
}
