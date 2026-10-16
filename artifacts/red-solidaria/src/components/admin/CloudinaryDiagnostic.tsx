import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope } from "lucide-react";
import { errorMessage } from "@/lib/api-error";
import {
  useCloudinaryCheck,
  type CloudinaryCheckResult,
} from "@/hooks/use-institutional-identity";

/**
 * Diagnóstico de la subida de imágenes (V18.1).
 *
 * Ejecuta en el SERVIDOR la misma subida firmada que hace el navegador (un PNG de
 * 1×1 que se borra acto seguido) y muestra la causa exacta cuando falla: credenciales
 * que no corresponden al cloud, firma inválida, parámetro rechazado o Cloudinary
 * inaccesible. Sin esto, un 401 solo dice «Unauthorized» y hay que adivinar.
 *
 * Nunca expone el api_secret; el cloud name sí se muestra porque es público.
 */
export function CloudinaryDiagnostic() {
  const check = useCloudinaryCheck();
  const [result, setResult] = useState<CloudinaryCheckResult | null>(null);

  const run = () =>
    check.mutate(undefined, {
      onSuccess: (data) => setResult(data),
      onError: () => setResult(null),
    });

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Stethoscope className="h-5 w-5" /> Diagnóstico de subida de imágenes
      </h2>
      <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
        Comprueba en el servidor la firma y las credenciales de Cloudinary (sube una imagen de
        prueba de 1×1 y la borra). Úsalo si una subida falla.
      </p>

      <Button
        type="button"
        variant="outline"
        className="rounded-xl"
        disabled={check.isPending}
        onClick={run}
      >
        {check.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        Comprobar Cloudinary
      </Button>

      {check.isError && <p className="mt-3 text-sm text-red-700">{errorMessage(check.error)}</p>}

      {result && (
        <div className="mt-3 space-y-2 text-sm">
          <p
            className={`flex items-center gap-2 font-semibold ${
              result.ok ? "text-green-800" : "text-red-800"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {result.ok
              ? "Cloudinary responde correctamente."
              : result.configured
                ? `Cloudinary rechazó la subida${result.status ? ` (HTTP ${result.status})` : ""}.`
                : "Cloudinary no está configurado."}
          </p>

          <ul className="space-y-1 text-muted-foreground">
            <li>
              Cloud: <code className="rounded bg-secondary px-1">{result.cloudName ?? "—"}</code>
            </li>
            {result.cloudinaryMessage && (
              <li>
                Respuesta de Cloudinary:{" "}
                <code className="rounded bg-secondary px-1">{result.cloudinaryMessage}</code>
              </li>
            )}
          </ul>

          {result.hints.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {result.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
