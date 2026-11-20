import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/icono";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<IconoMarca size={64} />, size);
}
