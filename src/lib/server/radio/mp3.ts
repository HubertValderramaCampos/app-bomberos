/**
 * Utilidades mínimas de MP3 para recortar un stream Icecast sin decodificar:
 * los frames MP3 son independientes, así que basta con empezar en un encabezado válido.
 */

const BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR: Record<number, number[]> = { 0: [11025, 12000, 8000], 2: [22050, 24000, 16000], 3: [44100, 48000, 32000] };

/** Largo en bytes del frame Layer III que empieza en `o`, o 0 si no hay encabezado válido. */
function largoFrame(buf: Buffer, o: number): number {
  if (o + 4 > buf.length || buf[o] !== 0xff || (buf[o + 1] & 0xe0) !== 0xe0) return 0;
  const ver = (buf[o + 1] >> 3) & 3;
  const capa = (buf[o + 1] >> 1) & 3;
  const bri = buf[o + 2] >> 4;
  const sri = (buf[o + 2] >> 2) & 3;
  const pad = (buf[o + 2] >> 1) & 1;
  if (ver === 1 || capa !== 1 || bri === 0 || bri === 15 || sri === 3) return 0;
  const v1 = ver === 3;
  const br = (v1 ? BR_V1 : BR_V2)[bri] * 1000;
  const sr = SR[ver][sri];
  return Math.floor(((v1 ? 144 : 72) * br) / sr) + pad;
}

/** Recorta el buffer para que empiece en un frame MP3 válido (seguido de otro válido). */
export function alinearFrame(buf: Buffer): Buffer {
  for (let o = 0; o < Math.min(buf.length - 4, 8192); o++) {
    const l = largoFrame(buf, o);
    if (l && largoFrame(buf, o + l)) return buf.subarray(o);
  }
  return buf.subarray(0, 0);
}
