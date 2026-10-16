import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ApiError, errorMessage } from "@/lib/api-error";
import { optimizeImageUrl } from "@/lib/image-url";
import { ImageUploadField } from "@/components/shared/ImageUploadField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  Loader2,
  Save,
  Send,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ImageOff,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  emptyIdentityContent,
  identityFingerprint,
  useAdminInstitutionalIdentity,
  useDiscardIdentityAssets,
  usePublishIdentity,
  useSaveIdentityDraft,
  useUnpublishIdentity,
  type InstitutionalIdentityContent,
} from "@/hooks/use-institutional-identity";

const ENDPOINT = "/api/uploads/institutional-signature" as const;

const FOCUS_OPTIONS = [
  { value: "50% 50%", label: "Centro" },
  { value: "50% 20%", label: "Arriba" },
  { value: "50% 80%", label: "Abajo" },
  { value: "20% 50%", label: "Izquierda" },
  { value: "80% 50%", label: "Derecha" },
];

/**
 * Administración → Identidad institucional (Fase 3 · V18).
 *
 * Solo superadmin (la API lo impone con `requireRole(SUPERADMIN)`). Flujo explícito
 * con CONTROL DE VERSIÓN:
 *
 *   · El borrador NO es público hasta pulsar «Publicar».
 *   · «Publicar» GUARDA y publica en una sola operación: se publica exactamente lo
 *     que se está viendo (antes publicaba el borrador que ya estuviera en el
 *     servidor y podía publicar una versión vieja mostrando éxito).
 *   · Cada escritura envía la `version` leída; si otra sesión escribió antes, la API
 *     responde 409 y aquí se avisa en vez de pisar cambios ajenos.
 *   · El estado se muestra siempre: sin guardar / borrador guardado / publicación
 *     pendiente / publicado / error.
 */
export default function AdminInstitutionalIdentity() {
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useAdminInstitutionalIdentity();
  const saveDraft = useSaveIdentityDraft();
  const publish = usePublishIdentity();
  const unpublish = useUnpublishIdentity();
  const discardAssets = useDiscardIdentityAssets();

  const [form, setForm] = useState<InstitutionalIdentityContent>(emptyIdentityContent());
  const [version, setVersion] = useState(1);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [publishState, setPublishState] = useState<
    "idle" | "saved" | "published" | "error"
  >("idle");
  const [showPreview, setShowPreview] = useState(false);
  const loadedRef = useRef(false);

  // Carga el borrador una sola vez: los refetch no pisan lo que el usuario edita.
  useEffect(() => {
    if (data && !loadedRef.current) {
      setForm(data.draft ?? emptyIdentityContent());
      setVersion(data.version);
      setSavedFingerprint(identityFingerprint(data.draft ?? emptyIdentityContent()));
      setPending(data.hasPendingChanges);
      loadedRef.current = true;
    }
  }, [data]);

  const dirty = useMemo(
    () => identityFingerprint(form) !== savedFingerprint,
    [form, savedFingerprint],
  );

  // Protección frente a cambios no guardados al salir de la página.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patch = (partial: Partial<InstitutionalIdentityContent>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const reload = () => {
    loadedRef.current = false;
    setConflict(false);
    void refetch();
  };

  /** Limpia el archivo anterior cuando se reemplaza antes de guardar (anti-huérfanos). */
  const handleDiscard = (publicId: string) => {
    discardAssets.mutate([publicId], {
      onSuccess: (result) => {
        if (result.discarded > 0) {
          toast({
            title: "Archivo anterior eliminado",
            description: "El archivo reemplazado se borró de Cloudinary.",
          });
        }
      },
      // Best-effort: si no se puede, el borrado diferido lo hará al guardar.
      onError: () => undefined,
    });
  };

  const handleWriteError = (fallback: string) => (err: unknown) => {
    const isConflict = err instanceof ApiError && err.status === 409;
    setConflict(isConflict);
    setPublishState("error");
    toast({
      title: isConflict ? "Otra sesión cambió esto" : fallback,
      description: errorMessage(err),
      variant: "destructive",
    });
  };

  const onSave = () =>
    saveDraft.mutate(
      { content: form, version },
      {
        onSuccess: (result) => {
          setConflict(false);
          setForm(result.draft);
          setVersion(result.version);
          setSavedFingerprint(identityFingerprint(result.draft));
          setPending(result.hasPendingChanges);
          setPublishState("saved");
          toast({
            title: "Borrador guardado",
            description: "Todavía no es visible al público hasta que pulses Publicar.",
          });
        },
        onError: handleWriteError("No se pudo guardar el borrador"),
      },
    );

  // PUBLICAR = GUARDAR + PUBLICAR: se envía el contenido actual y la versión.
  const onPublish = () =>
    publish.mutate(
      { content: form, version },
      {
        onSuccess: (result) => {
          setConflict(false);
          setForm(result.draft);
          setVersion(result.version);
          setSavedFingerprint(identityFingerprint(result.draft));
          setPending(false);
          setPublishState("published");
          toast({
            title: "Publicado correctamente",
            description: "Los cambios pendientes se guardaron y ya se ven en la web pública.",
          });
        },
        onError: handleWriteError("No se pudo publicar"),
      },
    );

  const onUnpublish = () =>
    unpublish.mutate(
      { version },
      {
        onSuccess: (result) => {
          setConflict(false);
          setVersion(result.version);
          setPending(result.hasPendingChanges);
          setPublishState("saved");
          toast({
            title: "Identidad despublicada",
            description: "La web pública volvió a su contenido por defecto.",
          });
        },
        onError: handleWriteError("No se pudo despublicar"),
      },
    );

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-64 animate-pulse rounded bg-secondary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-lg p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h3 className="mb-2 text-lg font-bold">Acceso restringido</h3>
          <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        </div>
      </div>
    );
  }

  const busy = saveDraft.isPending || publish.isPending || unpublish.isPending;
  const isPublished = Boolean(data?.published);

  return (
    <div className="max-w-4xl p-6 pb-28 sm:p-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="font-display text-3xl font-black">Identidad institucional</h1>
          <p className="mt-1 text-muted-foreground">
            Logotipo, portada, favicon y «Nuestra historia». Solo el superadministrador puede
            modificarla.
          </p>
        </div>
        <StatusBadge
          dirty={dirty}
          pending={pending}
          published={isPublished}
          state={publishState}
          publishedAt={data?.publishedAt ?? null}
        />
      </div>

      {conflict && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
          <p className="flex-1 text-sm text-amber-900">
            Otra sesión modificó la identidad institucional mientras editabas. Para no pisar
            cambios ajenos no se guardó nada.
          </p>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={reload}>
            <RefreshCw className="mr-1 h-4 w-4" /> Recargar
          </Button>
        </div>
      )}

      {/* ── Logotipo ─────────────────────────────────────────────── */}
      <Section
        title="Logotipo institucional"
        description="Se muestra en el encabezado y en otras ubicaciones configuradas."
      >
        <div className="grid items-start gap-4 sm:grid-cols-[1fr,auto]">
          <ImageUploadField
            value={form.logo.url}
            onChange={(url, publicId) => patch({ logo: { url, publicId: publicId ?? null } })}
            label="Imagen del logotipo"
            endpoint={ENDPOINT}
            kind="logo"
            minSide={64}
            maxSide={4096}
            previewSize={72}
            onDiscard={handleDiscard}
            disabled={busy}
          />
          {form.logo.url && (
            <div className="text-center">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Vista previa</p>
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
                <img
                  src={optimizeImageUrl(form.logo.url, { width: 192 })}
                  alt="Vista previa del logotipo"
                  className="h-20 w-20 object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Portada ──────────────────────────────────────────────── */}
      <Section
        title="Portada institucional"
        description="Imagen de la página principal. Se puede ajustar el encuadre y ver la versión móvil."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField
            value={form.cover.desktopUrl}
            onChange={(url, publicId) =>
              patch({ cover: { ...form.cover, desktopUrl: url, publicId: publicId ?? null } })
            }
            label="Portada (escritorio)"
            endpoint={ENDPOINT}
            kind="cover"
            minSide={600}
            previewSize={72}
            onDiscard={handleDiscard}
            disabled={busy}
          />
          <ImageUploadField
            value={form.cover.mobileUrl}
            onChange={(url) => patch({ cover: { ...form.cover, mobileUrl: url } })}
            label="Portada (móvil, opcional)"
            endpoint={ENDPOINT}
            kind="cover"
            minSide={400}
            previewSize={72}
            onDiscard={handleDiscard}
            disabled={busy}
          />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Encuadre</label>
          <select
            value={form.cover.focus}
            onChange={(event) => patch({ cover: { ...form.cover, focus: event.target.value } })}
            className="h-10 w-full rounded-xl border border-input bg-secondary/30 px-3 text-sm sm:w-64"
          >
            {FOCUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[2fr,1fr]">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Vista escritorio</p>
            <div className="aspect-[16/6] overflow-hidden rounded-xl bg-secondary">
              {form.cover.desktopUrl ? (
                <img
                  src={optimizeImageUrl(form.cover.desktopUrl, { width: 1200 })}
                  alt="Portada (escritorio)"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: form.cover.focus }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <ImageOff className="mr-1 h-5 w-5" /> Sin portada
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Vista móvil</p>
            <div className="mx-auto aspect-[9/16] max-h-56 overflow-hidden rounded-xl bg-secondary">
              {form.cover.mobileUrl || form.cover.desktopUrl ? (
                <img
                  src={optimizeImageUrl(form.cover.mobileUrl || form.cover.desktopUrl, { width: 600 })}
                  alt="Portada (móvil)"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: form.cover.focus }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Favicon ──────────────────────────────────────────────── */}
      <Section
        title="Favicon"
        description="Icono que aparece en la pestaña del navegador. Debe ser CUADRADO (PNG o WebP)."
      >
        <ImageUploadField
          value={form.favicon.url}
          onChange={(url, publicId) => patch({ favicon: { url, publicId: publicId ?? null } })}
          label="Favicon"
          endpoint={ENDPOINT}
          kind="favicon"
          requireSquare
          minSide={32}
          maxSide={1024}
          previewSize={64}
          onDiscard={handleDiscard}
          disabled={busy}
        />
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <FaviconPreview label="32 × 32" url={form.favicon.url} size={32} />
          <FaviconPreview label="64 × 64" url={form.favicon.url} size={64} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-muted-foreground"
            disabled={busy}
            onClick={() => patch({ favicon: { url: "", publicId: null } })}
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Restaurar favicon predeterminado
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Sin favicon propio se usa el estático del sitio. Al publicar, la URL se versiona para que
          el navegador no muestre el icono antiguo.
        </p>
      </Section>

      {/* ── Texto principal ──────────────────────────────────────── */}
      <Section
        title="Texto principal y llamada a la acción"
        description="Opcionales. Si se dejan vacíos, la portada muestra solo la imagen."
      >
        <div className="space-y-3">
          <Field label="Título principal">
            <Input
              value={form.hero.title}
              onChange={(event) => patch({ hero: { ...form.hero, title: event.target.value } })}
              className="rounded-xl bg-secondary/30"
              placeholder="Red Solidaria San Ramón"
            />
          </Field>
          <Field label="Subtítulo">
            <Input
              value={form.hero.subtitle}
              onChange={(event) => patch({ hero: { ...form.hero, subtitle: event.target.value } })}
              className="rounded-xl bg-secondary/30"
              placeholder="Una red que sostiene a la comunidad"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Texto del botón">
              <Input
                value={form.hero.ctaLabel}
                onChange={(event) => patch({ hero: { ...form.hero, ctaLabel: event.target.value } })}
                className="rounded-xl bg-secondary/30"
                placeholder="Quiero ayudar"
              />
            </Field>
            <Field label="Enlace del botón">
              <Input
                value={form.hero.ctaHref}
                onChange={(event) => patch({ hero: { ...form.hero, ctaHref: event.target.value } })}
                className="rounded-xl bg-secondary/30"
                placeholder="/como-ayudar"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            El enlace admite rutas internas («/como-ayudar») o URLs https.
          </p>
        </div>
      </Section>

      {/* ── Nuestra historia ─────────────────────────────────────── */}
      <Section title="Nuestra historia" description="Se muestra en la página pública «Nosotros».">
        <div className="space-y-4">
          <Field label="Título">
            <Input
              value={form.story.title}
              onChange={(event) => patch({ story: { ...form.story, title: event.target.value } })}
              className="rounded-xl bg-secondary/30"
              placeholder="Nuestra historia"
            />
          </Field>
          <Field label="Subtítulo">
            <Input
              value={form.story.subtitle}
              onChange={(event) => patch({ story: { ...form.story, subtitle: event.target.value } })}
              className="rounded-xl bg-secondary/30"
              placeholder="Cómo empezó todo"
            />
          </Field>
          <RichTextEditor
            label="Historia institucional"
            value={form.story.html}
            onChange={(html) => patch({ story: { ...form.story, html } })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Misión">
              <Textarea
                value={form.mission}
                onChange={(event) => patch({ mission: event.target.value })}
                className="min-h-[90px] rounded-xl bg-secondary/30"
              />
            </Field>
            <Field label="Visión">
              <Textarea
                value={form.vision}
                onChange={(event) => patch({ vision: event.target.value })}
                className="min-h-[90px] rounded-xl bg-secondary/30"
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Valores</p>
            <div className="space-y-2">
              {form.values.map((value, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Input
                    value={value.title}
                    onChange={(event) =>
                      patch({
                        values: form.values.map((item, i) =>
                          i === index ? { ...item, title: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="Título (p. ej. Transparencia)"
                    className="rounded-xl bg-secondary/30 sm:max-w-[220px]"
                  />
                  <Input
                    value={value.description}
                    onChange={(event) =>
                      patch({
                        values: form.values.map((item, i) =>
                          i === index ? { ...item, description: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="Descripción breve"
                    className="rounded-xl bg-secondary/30"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    aria-label="Quitar valor"
                    onClick={() => patch({ values: form.values.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 rounded-xl"
              onClick={() => patch({ values: [...form.values, { title: "", description: "" }] })}
            >
              <Plus className="mr-1 h-4 w-4" /> Añadir valor
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Fotografías</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {form.story.photos.map((photo, index) => (
                <div key={index} className="relative">
                  <ImageUploadField
                    value={photo}
                    onChange={(url) =>
                      patch({
                        story: {
                          ...form.story,
                          photos: form.story.photos.map((item, i) => (i === index ? url : item)),
                        },
                      })
                    }
                    label={`Foto ${index + 1}`}
                    endpoint={ENDPOINT}
                    kind="story"
                    onDiscard={handleDiscard}
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 text-destructive hover:bg-destructive/10"
                    aria-label="Quitar foto"
                    onClick={() =>
                      patch({
                        story: {
                          ...form.story,
                          photos: form.story.photos.filter((_, i) => i !== index),
                        },
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 rounded-xl"
              onClick={() => patch({ story: { ...form.story, photos: [...form.story.photos, ""] } })}
            >
              <Plus className="mr-1 h-4 w-4" /> Añadir foto
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Vista previa ─────────────────────────────────────────── */}
      <Section title="Vista previa" description="Así verá el público la identidad publicada.">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-3 rounded-xl"
          onClick={() => setShowPreview((value) => !value)}
        >
          {showPreview ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          {showPreview ? "Ocultar vista previa" : "Mostrar vista previa"}
        </Button>
        {showPreview && (
          <div className="overflow-hidden rounded-2xl border border-border">
            {(form.cover.desktopUrl || form.cover.mobileUrl || form.hero.title) && (
              <div className="relative">
                {(form.cover.desktopUrl || form.cover.mobileUrl) && (
                  <img
                    src={optimizeImageUrl(form.cover.desktopUrl || form.cover.mobileUrl, {
                      width: 1200,
                    })}
                    alt=""
                    className="aspect-[16/6] w-full object-cover"
                    style={{ objectPosition: form.cover.focus }}
                  />
                )}
                <div className="bg-card p-5 text-center">
                  {form.hero.title && (
                    <h2 className="font-display text-2xl font-bold">{form.hero.title}</h2>
                  )}
                  {form.hero.subtitle && (
                    <p className="mt-1 text-muted-foreground">{form.hero.subtitle}</p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                {form.favicon.url && (
                  <img src={optimizeImageUrl(form.favicon.url, { width: 32 })} alt="Favicon" className="h-4 w-4" />
                )}
                {form.story.title && (
                  <h3 className="font-display text-xl font-bold">{form.story.title}</h3>
                )}
              </div>
              {form.story.html && (
                <div
                  className="prose-sm text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: form.story.html }}
                />
              )}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {form.mission && (
                  <div>
                    <p className="font-semibold">Misión</p>
                    <p className="text-muted-foreground">{form.mission}</p>
                  </div>
                )}
                {form.vision && (
                  <div>
                    <p className="font-semibold">Visión</p>
                    <p className="text-muted-foreground">{form.vision}</p>
                  </div>
                )}
              </div>
              {form.values.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {form.values.map((value, index) => (
                    <li key={index}>
                      {value.title}
                      {value.description ? ` — ${value.description}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── Barra de acciones fija ───────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-8 md:left-64">
        <div className="flex max-w-4xl flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={busy}
            onClick={onSave}
          >
            {saveDraft.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Guardar borrador
          </Button>
          <Button type="button" className="rounded-xl" disabled={busy} onClick={onPublish}>
            {publish.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Publicar
          </Button>
          {isPublished && (
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={onUnpublish}
            >
              <EyeOff className="mr-1 h-4 w-4" /> Despublicar
            </Button>
          )}
          <p className="text-xs text-muted-foreground sm:ml-auto">
            {dirty
              ? "Hay cambios sin guardar: «Publicar» los guarda y los publica de una vez."
              : "Guardar no publica. La web cambia solo al pulsar «Publicar»."}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Estado del flujo, siempre visible (requisito V18). */
function StatusBadge({
  dirty,
  pending,
  published,
  state,
  publishedAt,
}: {
  dirty: boolean;
  pending: boolean;
  published: boolean;
  state: "idle" | "saved" | "published" | "error";
  publishedAt: string | null;
}) {
  if (state === "error") {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800">
        Error de publicación
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
        Cambios sin guardar
      </span>
    );
  }
  if (pending) {
    return (
      <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800">
        Borrador guardado · pendiente de publicar
      </span>
    );
  }
  if (published) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Publicado correctamente
        {publishedAt ? ` · ${new Date(publishedAt).toLocaleDateString("es-PE")}` : ""}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      Sin publicar
    </span>
  );
}

function FaviconPreview({ label, url, size }: { label: string; url: string; size: number }) {
  return (
    <div className="text-center">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <div
        className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-card"
        style={{ width: size + 16, height: size + 16 }}
      >
        {url ? (
          <img
            src={optimizeImageUrl(url, { width: size * 2 })}
            alt={`Favicon ${label}`}
            style={{ width: size, height: size }}
            className="object-contain"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
