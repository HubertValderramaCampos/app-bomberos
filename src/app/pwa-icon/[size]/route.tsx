import { ImageResponse } from "next/og";
import { IconoMarca } from "@/lib/icono";

const TAMANOS: Record<string, { size: number; maskable: boolean }> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "512m": { size: 512, maskable: true },
  badge: { size: 96, maskable: true },
};

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const t = TAMANOS[size];
  if (!t) return new Response("No encontrado", { status: 404 });
  return new ImageResponse(<IconoMarca size={t.size} maskable={t.maskable} />, {
    width: t.size,
    height: t.size,
    headers: { "Cache-Control": "public, max-age=604800, immutable" },
  });
}
