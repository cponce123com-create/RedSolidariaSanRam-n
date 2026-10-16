import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { uploadImageToCloudinary } from "@/lib/cloudinary-upload";
import { describeImageValidation } from "@/lib/image-validation";

/**
 * Activo de imagen del CMS (Fase 4).
 *
 * A diferencia del campo de la identidad, un activo del CMS lleva además:
 *   - texto ALTERNATIVO bilingüe (accesibilidad),
 *   - ENCUADRE (`object-position`) elegible con una rejilla 3×3, que es lo que evita
 *     que una foto salga «recortada» por la cabeza,
 *   - PROPORCIÓN sugerida (informativa para el diseño).
 *
 * La subida va directa a Cloudinary con una firma del servidor; el SERVIDOR fija la
 * carpeta (`cms/<slug>`), así que el cliente no puede pedir una carpeta arbitraria.
 * El `publicId` se conserva para poder borrar el archivo anterior cuando se reemplaza.
 */
export interface CmsImageValue {
  url: string;
  publicId: string | null;
  alt: { es: string; en: string };
  focus: string;
  ratio: string;
}

export function emptyCmsImage(): CmsImageValue {
  return { url: "", publicId: null, alt: { es: "", en: "" }, focus: "50% 50%", ratio: "" };
}

const FOCUS_X = [
  { label: "Izquierda", value: 0 },
  { label: "Centro", value: 50 },
  { label: "Derecha", value: 100 },
] as const;
const FOCUS_Y = [
  { label: "Arriba", value: 0 },
  { label: "Medio", value: 50 },
  { label: "Abajo", value: 100 },
] as const;
const RATIOS = [
  { label: "Automática", value: "" },
  { label: "Panorámica 16:9", value: "16/9" },
  { label: "Clásica 4:3", value: "4/3" },
  { label: "Cuadrada 1:1", value: "1/1" },
  { label: "Retrato 3:4", value: "3/4" },
];

async function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      /* se intenta con <img> */
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface CmsImageFieldProps {
  /** Página del CMS: el servidor fija la carpeta `cms/<slug>`. */
  page: string;
  value: CmsImageValue;
  onChange: (value: CmsImageValue) => void;
  label: string;
  onDiscard?: (publicId: string) => void;
  disabled?: boolean;
}

export function CmsImageField({
  page,
  value,
  onChange,
  label,
  onDiscard,
  disabled = false,
}: CmsImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousPublicIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const patch = (partial: Partial<CmsImageValue>) => onChange({ ...value, ...partial });

  const handleFile = async (file: File) => {
    if (busy || disabled) return;
    setError(null);
    setSuccess(false);

    const dimensions = await readDimensions(file);
    const check = describeImageValidation({
      type: file.type,
      size: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(true);
    try {
      const result = await uploadImageToCloudinary(file, "/api/uploads/cms-signature", { page });
      if (previousPublicIdRef.current && previousPublicIdRef.current !== result.publicId) {
        onDiscard?.(previousPublicIdRef.current);
      }
      previousPublicIdRef.current = result.publicId;
      onChange({ ...value, url: result.imageUrl, publicId: result.publicId });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [focusX, focusY] = value.focus.split(" ").map((part) => Number.parseInt(part, 10));
  const isActive = (x: number, y: number) => focusX === x && focusY === y;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {success && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Imagen subida
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="h-28 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/30">
          {value.url ? (
            <img
              src={value.url}
              alt={value.alt.es || label}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: value.focus }}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-[14rem] flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={value.url ? "outline" : "default"}
              size="sm"
              className="rounded-lg"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : value.url ? (
                <RefreshCw className="mr-1 h-4 w-4" />
              ) : (
                <UploadCloud className="mr-1 h-4 w-4" />
              )}
              {busy ? "Subiendo…" : value.url ? "Reemplazar" : "Subir imagen"}
            </Button>
            {value.url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg text-destructive hover:bg-destructive/10"
                disabled={busy || disabled}
                onClick={() => {
                  if (previousPublicIdRef.current) onDiscard?.(previousPublicIdRef.current);
                  previousPublicIdRef.current = null;
                  onChange({ ...emptyCmsImage(), alt: value.alt, focus: value.focus, ratio: value.ratio });
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Quitar
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg"
              disabled={disabled}
              onClick={() => setShowUrl((current) => !current)}
            >
              Usar URL
            </Button>
          </div>

          {showUrl && (
            <Input
              value={value.url}
              onChange={(event) => patch({ url: event.target.value, publicId: null })}
              className="rounded-lg bg-background text-xs"
              placeholder="https://…"
              disabled={disabled}
            />
          )}

          {error && (
            <p className="flex items-start gap-1 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>
      </div>

      {/* Texto alternativo (accesibilidad) */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Texto alternativo (ES)
          <Input
            value={value.alt.es}
            onChange={(event) => patch({ alt: { ...value.alt, es: event.target.value } })}
            className="mt-1 rounded-lg bg-background text-xs"
            disabled={disabled}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Texto alternativo (EN)
          <Input
            value={value.alt.en}
            onChange={(event) => patch({ alt: { ...value.alt, en: event.target.value } })}
            className="mt-1 rounded-lg bg-background text-xs"
            disabled={disabled}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {/* Encuadre: rejilla 3×3 → object-position */}
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Encuadre</p>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Encuadre de la imagen">
            {FOCUS_Y.map((row) =>
              FOCUS_X.map((column) => {
                const active = isActive(column.value, row.value);
                return (
                  <button
                    key={`${column.value}-${row.value}`}
                    type="button"
                    disabled={disabled}
                    aria-label={`${row.label} ${column.label}`}
                    aria-pressed={active}
                    onClick={() => patch({ focus: `${column.value}% ${row.value}%` })}
                    className={`h-6 w-6 rounded border text-[10px] transition-colors ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  />
                );
              }),
            )}
          </div>
        </div>

        <label className="text-xs text-muted-foreground">
          Proporción
          <select
            value={value.ratio}
            disabled={disabled}
            onChange={(event) => patch({ ratio: event.target.value })}
            className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            {RATIOS.map((ratio) => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
