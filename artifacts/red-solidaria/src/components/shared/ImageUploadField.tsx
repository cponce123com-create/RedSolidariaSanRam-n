import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  UploadCloud,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { uploadImageToCloudinary } from "@/lib/cloudinary-upload";
import {
  describeImageValidation,
  FAVICON_ALLOWED_IMAGE_TYPES,
} from "@/lib/image-validation";

/** Tipo de activo: el servidor fija carpeta y formatos permitidos por tipo. */
export type UploadAssetKind = "logo" | "cover" | "favicon" | "story";

interface ImageUploadFieldProps {
  value: string | null | undefined;
  /**
   * `publicId` es el identificador del archivo en Cloudinary. Se conserva para poder
   * borrar el activo cuando se reemplaza (V18); antes se descartaba.
   */
  onChange: (value: string, publicId?: string | null) => void;
  label?: string;
  // Endpoint de firma: admin por defecto; formularios públicos usan
  // "/api/uploads/signature" (rate limitado por IP, sin sesión).
  endpoint?:
    | "/api/uploads/signature"
    | "/api/uploads/admin-signature"
    | "/api/uploads/institutional-signature";
  kind?: UploadAssetKind;
  /** Exige imagen cuadrada (favicon). */
  requireSquare?: boolean;
  minSide?: number;
  maxSide?: number;
  /** Lado de la vista previa en px. */
  previewSize?: number;
  disabled?: boolean;
  /** Se llama con el publicId de la imagen recién reemplazada (para limpiarla). */
  onDiscard?: (publicId: string) => void;
}

/** Lee las dimensiones reales del archivo (para validar cuadratura y tamaño). */
async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      /* sin soporte: se intenta con <img> */
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

/**
 * Campo de imagen con subida directa a Cloudinary (V18).
 *
 * Diferencias con la versión anterior, que impedían REEMPLAZAR:
 *  - El botón «Subir / Reemplazar» es PERMANENTE: antes, con una imagen puesta, solo
 *    se podía pegar una URL o borrarla (dejando un cambio sin guardar) para subir otra.
 *  - Se muestra siempre la vista previa de la imagen actual y el estado del último
 *    resultado (éxito/error) sin depender del toast.
 *  - Se valida formato, PESO y DIMENSIONES antes de subir.
 *  - Se bloquea mientras hay una subida o comprobación en curso (nada de subidas
 *    simultáneas).
 *  - Se devuelve el `publicId` y, al reemplazar, se avisa con `onDiscard` para poder
 *    limpiar el archivo anterior (el servidor solo borra lo que no está en uso).
 */
export function ImageUploadField({
  value,
  onChange,
  label,
  endpoint = "/api/uploads/admin-signature",
  kind,
  requireSquare,
  minSide,
  maxSide,
  previewSize = 64,
  disabled = false,
  onDiscard,
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousPublicIdRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const allowedTypes = kind === "favicon" ? FAVICON_ALLOWED_IMAGE_TYPES : undefined;
  const resolvedLabel = label ?? t("imageUpload.label");
  const busy = uploading || checking;

  const handleFile = async (file: File) => {
    // Protección frente a subidas SIMULTÁNEAS.
    if (busy || disabled) return;
    setError(null);
    setSuccess(null);

    setChecking(true);
    const dimensions = await readImageDimensions(file);
    setChecking(false);

    const check = describeImageValidation({
      type: file.type,
      size: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      allowedTypes,
      requireSquare,
      minSide,
      maxSide,
    });
    if (!check.ok) {
      setError(check.message);
      toast({
        title: t("imageUpload.invalidFile"),
        description: check.message,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file, endpoint, kind ? { kind } : {});
      // El archivo anterior ya no se usa en este formulario: se puede descartar. El
      // servidor solo lo borra si no está guardado ni publicado.
      if (previousPublicIdRef.current && previousPublicIdRef.current !== result.publicId) {
        onDiscard?.(previousPublicIdRef.current);
      }
      previousPublicIdRef.current = result.publicId;
      onChange(result.imageUrl, result.publicId);
      setSuccess(result.imageUrl);
      toast({
        title: t("imageUpload.uploaded"),
        description: t("imageUpload.uploadedDescription"),
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : t("imageUpload.retry");
      setError(message);
      toast({
        title: t("imageUpload.uploadError"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const accept = (allowedTypes ?? ["image/jpeg", "image/png", "image/webp"]).join(",");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{resolvedLabel}</p>
        {success && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t("imageUpload.uploaded")}
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/30"
          style={{ width: previewSize, height: previewSize }}
        >
          {value ? (
            <img
              src={value}
              alt={resolvedLabel}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            {/* BOTÓN PERMANENTE: existe siempre, haya o no imagen puesta. */}
            <Button
              type="button"
              variant={value ? "outline" : "default"}
              size="sm"
              className="rounded-xl"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : value ? (
                <RefreshCw className="mr-1 h-4 w-4" />
              ) : (
                <UploadCloud className="mr-1 h-4 w-4" />
              )}
              {busy
                ? checking
                  ? t("imageUpload.checking")
                  : t("imageUpload.uploading")
                : value
                  ? t("imageUpload.replace")
                  : t("imageUpload.upload")}
            </Button>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-destructive hover:bg-destructive/10"
                disabled={busy || disabled}
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  if (previousPublicIdRef.current) onDiscard?.(previousPublicIdRef.current);
                  previousPublicIdRef.current = null;
                  onChange("", null);
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> {t("imageUpload.removeTitle")}
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              disabled={busy || disabled}
              onClick={() => setShowUrl((current) => !current)}
            >
              <Link2 className="mr-1 h-4 w-4" /> {t("imageUpload.useUrl")}
            </Button>
          </div>

          {showUrl && (
            <Input
              value={value ?? ""}
              onChange={(event) => onChange(event.target.value, null)}
              className="rounded-lg bg-background text-xs"
              placeholder={t("imageUpload.placeholder")}
              disabled={disabled}
            />
          )}

          <p className="text-[10px] text-muted-foreground">
            {kind === "favicon"
              ? "PNG o WebP · cuadrado · máx 8 MB"
              : t("imageUpload.formats")}
          </p>

          {error && (
            <p className="flex items-start gap-1 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
