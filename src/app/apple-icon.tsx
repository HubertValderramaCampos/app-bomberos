import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/icono";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconoMarca size={180} maskable />, size);
}
