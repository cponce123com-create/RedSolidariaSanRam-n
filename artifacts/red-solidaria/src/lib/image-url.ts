/**
 * Optimización de URLs de imagen para Cloudinary (f_auto/q_auto).
 *
 * Las imágenes subidas por el equipo/admin viven en res.cloudinary.com. Sin
 * transformación se sirven en el formato original (JPG/PNG) y a tamaño
 * original; con f_auto/q_auto Cloudinary entrega WebP/AVIF según el navegador
 * (~30-50% menos peso) y con w_ redimensiona a la anchura pedida.
 *
 * Cualquier URL que NO sea de Cloudinary (fallbacks de Unsplash, URLs de
 * terceros) pasa intacta: la función es segura de aplicar en cualquier <img>.
 *
 * Formato Cloudinary:
 *   https://res.cloudinary.com/<cloud>/image/upload/<transformaciones>/<asset>
 * La transformación se inserta entre "/upload" y el resto del path.
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  options: { width?: number } = {},
): string {
  if (!url) return "";
  const uploadMarker = "/image/upload/";
  const idx = url.indexOf(uploadMarker);
  if (idx === -1) return url; // no es Cloudinary → intacta

  const transforms = ["f_auto", "q_auto"];
  if (options.width && options.width > 0) {
    transforms.push(`w_${Math.round(options.width)}`);
  }

  const before = url.slice(0, idx + uploadMarker.length);
  const after = url.slice(idx + uploadMarker.length);
  // Si ya tiene transformaciones (p.ej. w_800), no las duplicamos: se añaden
  // solo las que falten. (Las subidas de la app no las tienen, pero defensivo.)
  const existing = after.split("/")[0];
  const hasTransform = /^[a-z_0-9,]+$/.test(existing) && existing.includes("_");
  const insert = transforms.filter((t) => !existing.includes(t.split("_")[0])).join(",");

  if (!insert) return url;
  return `${before}${hasTransform ? existing + "," : ""}${insert}/${hasTransform ? after.slice(existing.length + 1) : after}`;
}
