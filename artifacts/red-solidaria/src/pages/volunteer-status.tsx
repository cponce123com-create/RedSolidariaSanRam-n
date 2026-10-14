import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchVolunteerStatus,
  volunteerStatusBadge,
  volunteerStatusLabel,
  type VolunteerStatusInfo,
} from "@/lib/volunteers-admin";
import { formatSafeDate } from "@/lib/i18n/date";
import { ArrowLeft, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

/**
 * Página pública de seguimiento del voluntariado (Fase 5).
 *
 * El token del enlace es la única credencial. Divulgación MÍNIMA: solo el estado
 * y la fecha de actualización; nunca nombre, correo ni teléfono.
 */
export default function VolunteerStatus() {
  const params = useParams<{ token?: string }>();
  const token = (params.token ?? "").trim();
  const [info, setInfo] = useState<VolunteerStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Enlace no válido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchVolunteerStatus(token)
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo consultar el estado.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const status = info?.status ?? "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-card border border-border rounded-3xl p-8 text-center">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
            <Loader2 className="w-5 h-5 animate-spin" /> Consultando tu estado...
          </div>
        ) : error || !info ? (
          <div className="py-6">
            <XCircle className="w-12 h-12 mx-auto text-destructive mb-3" />
            <h1 className="text-xl font-display font-bold text-foreground">Enlace no válido</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {error ?? "No pudimos encontrar tu postulación con este enlace."}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {status === "approved" || status === "contacted" ? (
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" />
            ) : status === "rejected" ? (
              <XCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            ) : (
              <Clock className="w-12 h-12 mx-auto text-amber-500 mb-3" />
            )}

            <h1 className="text-2xl font-display font-bold text-foreground">
              Estado de tu postulación
            </h1>
            <Badge
              className={`${volunteerStatusBadge(status)} border mt-4 shadow-none text-sm px-3 py-1`}
            >
              {volunteerStatusLabel(status)}
            </Badge>

            <p className="text-sm text-muted-foreground mt-4">
              {status === "pending" &&
                "Recibimos tu postulación. El equipo la revisará y se pondrá en contacto contigo."}
              {status === "reviewing" &&
                "Tu postulación está en revisión por el equipo de voluntariado."}
              {status === "approved" &&
                "¡Fuiste aprobado! Nos pondremos en contacto para coordinar tu primera actividad."}
              {status === "contacted" &&
                "Ya nos pusimos en contacto contigo para coordinar tu participación."}
              {status === "rejected" &&
                "En esta ocasión no pudimos continuar con tu postulación. ¡Gracias por tu interés!"}
            </p>

            {info.updatedAt && (
              <p className="text-xs text-muted-foreground mt-3">
                Última actualización: {formatSafeDate(info.updatedAt, "dd/MM/yyyy")}
              </p>
            )}
          </div>
        )}

        <Button asChild variant="ghost" className="mt-6 rounded-xl gap-2">
          <Link href="/voluntariado">
            <ArrowLeft className="w-4 h-4" /> Volver a voluntariado
          </Link>
        </Button>
      </div>
    </div>
  );
}
