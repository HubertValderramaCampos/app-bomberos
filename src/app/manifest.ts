import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Alerta 116 · Operaciones bomberiles",
    short_name: "Alerta 116",
    description:
      "Emergencias en tiempo real, radio en vivo, alertas cercanas y MATPEL con IA para bomberos voluntarios del Perú.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d11",
    theme_color: "#0b0d11",
    lang: "es-PE",
    categories: ["utilities", "navigation", "news"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Radio en vivo", url: "/radio" },
      { name: "Materiales peligrosos", url: "/matpel" },
    ],
  };
}
