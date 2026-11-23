import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar en otra carpeta (p. ej. pruebas sin pisar el servidor en marcha)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Servidor autocontenido para Docker (imagen más chica, menos RAM)
  output: "standalone",
};

export default nextConfig;
