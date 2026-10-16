import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api-error";
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
} from "lucide-react";
import {
  emptyIdentityContent,
  useAdminInstitutionalIdentity,
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
 * Administración → Identidad institucional (Fase 3).
 *
 * Solo superadmin (la API lo impone con `requireRole(SUPERADMIN)`; este ítem solo
 * aparece en el grupo «Sistema»). Flujo explícito: el borrador NO es público
 * hasta pulsar «Publicar». Guardar/Publicar/Despublicar muestran el resultado
 * REAL del servidor y refrescan panel y web con la misma invalidación.
 */
export default function AdminInstitutionalIdentity() {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useAdminInstitutionalIdentity();
  const saveDraft = useSaveIdentityDraft();
  const publish = usePublishIdentity();
  const unpublish = useUnpublishIdentity();

  const [form, setForm] = useState<InstitutionalIdentityContent>(emptyIdentityContent());
  const [showPreview, setShowPreview] = useState(false);
  const loadedRef = useRef(false);

  // Carga el borrador una sola vez: los refetch no pisan lo que el usuario edita.
  useEffect(() => {
    if (data && !loadedRef.current) {
      setForm(data.draft ?? emptyIdentityContent());
      loadedRef.current = true;
    }
  }, [data]);

  const patch = (partial: Partial<InstitutionalIdentityContent>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const onSave = () =>
    saveDraft.mutate(form, {
      onSuccess: () =>
        toast({
          title: "Borrador guardado",
          description: "Todavía no es visible al público hasta que pulses Publicar.",
        }),
      onError: (e) =>
        toast({
          title: "No se pudo guardar el borrador",
          description: errorMessage(e),
          variant: "destructive",
        }),
    });

  const onPublish = () =>
    publish.mutate(undefined, {
      onSuccess: () =>
        toast({
          title: "Identidad publicada",
          description: "La web pública ya muestra este contenido.",
        }),
      onError: (e) =>
        toast({
          title: "No se pudo publicar",
          description: errorMessage(e),
          variant: "destructive",
        }),
    });

  const onUnpublish = () =>
    unpublish.mutate(undefined, {
      onSuccess: () =>
        toast({
          title: "Identidad despublicada",
          description: "La web pública volvió a su contenido por defecto.",
        }),
      onError: (e) =>
        toast({
          title: "No se pudo despublicar",
          description: errorMessage(e),
          variant: "destructive",
        }),
    });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-64 bg-secondary rounded animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 max-w-lg">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-lg mb-2">Acceso restringido</h3>
          <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        </div>
      </div>
    );
  }

  const isPublished = Boolean(data?.published);
  const busy = saveDraft.isPending || publish.isPending || unpublish.isPending;

  return (
    <div className="p-6 sm:p-8 max-w-4xl pb-28">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-black">Identidad institucional</h1>
          <p className="text-muted-foreground mt-1">
            Logotipo, portada y «Nuestra historia». Solo el superadministrador puede modificarla.
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${
            isPublished ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {isPublished
            ? `Publicado${data?.publishedAt ? ` el ${new Date(data.publishedAt).toLocaleDateString("es-PE")}` : ""}`
            : "Sin publicar"}
        </span>
      </div>

      {/* ── Logotipo ─────────────────────────────────────────────── */}
      <Section title="Logotipo institucional" description="Se muestra en el encabezado y en otras ubicaciones configuradas.">
        <div className="grid sm:grid-cols-[1fr,auto] gap-4 items-start">
          <ImageUploadField
            value={form.logo.url}
            onChange={(url) => patch({ logo: { url, publicId: null } })}
            label="Imagen del logotipo"
            endpoint={ENDPOINT}
          />
          {form.logo.url && (
            <div className="text-center">
              <p className="text-xs font-semibold mb-2 text-muted-foreground">Vista previa</p>
              <div className="w-24 h-24 rounded-2xl border border-border bg-card flex items-center justify-center overflow-hidden">
                <img src={optimizeImageUrl(form.logo.url, { width: 192 })} alt="Vista previa del logotipo" className="w-20 h-20 object-contain" />
              </div>
            </div>
          )}
        </div>
        {form.logo.url && (
          <Button type="button" variant="ghost" size="sm" className="mt-2 text-destructive hover:bg-destructive/10 rounded-xl"
            onClick={() => patch({ logo: { url: "", publicId: null } })}>
            <Trash2 className="w-4 h-4 mr-1" /> Quitar logotipo
          </Button>
        )}
      </Section>

      {/* ── Portada ──────────────────────────────────────────────── */}
      <Section title="Portada institucional" description="Imagen de la página principal. Se puede ajustar el encuadre y ver la versión móvil.">
        <div className="grid sm:grid-cols-2 gap-4">
          <ImageUploadField value={form.cover.desktopUrl} onChange={(url) => patch({ cover: { ...form.cover, desktopUrl: url, publicId: null } })} label="Portada (escritorio)" endpoint={ENDPOINT} />
          <ImageUploadField value={form.cover.mobileUrl} onChange={(url) => patch({ cover: { ...form.cover, mobileUrl: url, publicId: null } })} label="Portada (móvil, opcional)" endpoint={ENDPOINT} />
        </div>
        <div className="mt-4">
          <label className="text-sm font-medium block mb-1">Encuadre</label>
          <select
            value={form.cover.focus}
            onChange={(e) => patch({ cover: { ...form.cover, focus: e.target.value } })}
            className="w-full sm:w-64 h-10 px-3 rounded-xl border border-input bg-secondary/30 text-sm"
          >
            {FOCUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="grid sm:grid-cols-[2fr,1fr] gap-4 mt-4">
          <div>
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Vista escritorio</p>
            <div className="aspect-[16/6] rounded-xl overflow-hidden bg-secondary">
              {form.cover.desktopUrl ? (
                <img src={optimizeImageUrl(form.cover.desktopUrl, { width: 1200 })} alt="Portada (escritorio)" className="w-full h-full object-cover" style={{ objectPosition: form.cover.focus }} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs"><ImageOff className="w-5 h-5 mr-1" /> Sin portada</div>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Vista móvil</p>
            <div className="aspect-[9/16] max-h-56 mx-auto rounded-xl overflow-hidden bg-secondary">
              {form.cover.mobileUrl || form.cover.desktopUrl ? (
                <img src={optimizeImageUrl(form.cover.mobileUrl || form.cover.desktopUrl, { width: 600 })} alt="Portada (móvil)" className="w-full h-full object-cover" style={{ objectPosition: form.cover.focus }} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs"><ImageOff className="w-5 h-5" /></div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Texto principal ──────────────────────────────────────── */}
      <Section title="Texto principal y llamada a la acción" description="Opcionales. Si se dejan vacíos, la portada muestra solo la imagen.">
        <div className="space-y-3">
          <Field label="Título principal">
            <Input value={form.hero.title} onChange={(e) => patch({ hero: { ...form.hero, title: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="Red Solidaria San Ramón" />
          </Field>
          <Field label="Subtítulo">
            <Input value={form.hero.subtitle} onChange={(e) => patch({ hero: { ...form.hero, subtitle: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="Una red que sostiene a la comunidad" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Texto del botón">
              <Input value={form.hero.ctaLabel} onChange={(e) => patch({ hero: { ...form.hero, ctaLabel: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="Quiero ayudar" />
            </Field>
            <Field label="Enlace del botón">
              <Input value={form.hero.ctaHref} onChange={(e) => patch({ hero: { ...form.hero, ctaHref: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="/como-ayudar" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">El enlace admite rutas internas («/como-ayudar») o URLs https.</p>
        </div>
      </Section>

      {/* ── Nuestra historia ─────────────────────────────────────── */}
      <Section title="Nuestra historia" description="Se muestra en la página pública «Nosotros».">
        <div className="space-y-4">
          <Field label="Título">
            <Input value={form.story.title} onChange={(e) => patch({ story: { ...form.story, title: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="Nuestra historia" />
          </Field>
          <Field label="Subtítulo">
            <Input value={form.story.subtitle} onChange={(e) => patch({ story: { ...form.story, subtitle: e.target.value } })} className="rounded-xl bg-secondary/30" placeholder="Cómo empezó todo" />
          </Field>
          <RichTextEditor
            label="Historia institucional"
            value={form.story.html}
            onChange={(html) => patch({ story: { ...form.story, html } })}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Misión">
              <Textarea value={form.mission} onChange={(e) => patch({ mission: e.target.value })} className="rounded-xl bg-secondary/30 min-h-[90px]" />
            </Field>
            <Field label="Visión">
              <Textarea value={form.vision} onChange={(e) => patch({ vision: e.target.value })} className="rounded-xl bg-secondary/30 min-h-[90px]" />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Valores</p>
            <div className="space-y-2">
              {form.values.map((v, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input value={v.title} onChange={(e) => patch({ values: form.values.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)) })} placeholder="Título (p. ej. Transparencia)" className="rounded-xl bg-secondary/30 sm:max-w-[220px]" />
                  <Input value={v.description} onChange={(e) => patch({ values: form.values.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)) })} placeholder="Descripción breve" className="rounded-xl bg-secondary/30" />
                  <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" aria-label="Quitar valor" onClick={() => patch({ values: form.values.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => patch({ values: [...form.values, { title: "", description: "" }] })}>
              <Plus className="w-4 h-4 mr-1" /> Añadir valor
            </Button>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Fotografías</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {form.story.photos.map((photo, i) => (
                <div key={i} className="relative">
                  <ImageUploadField value={photo} onChange={(url) => patch({ story: { ...form.story, photos: form.story.photos.map((p, idx) => (idx === i ? url : p)) } })} label={`Foto ${i + 1}`} endpoint={ENDPOINT} />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 text-destructive hover:bg-destructive/10" aria-label="Quitar foto" onClick={() => patch({ story: { ...form.story, photos: form.story.photos.filter((_, idx) => idx !== i) } })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => patch({ story: { ...form.story, photos: [...form.story.photos, ""] } })}>
              <Plus className="w-4 h-4 mr-1" /> Añadir foto
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Vista previa ─────────────────────────────────────────── */}
      <Section title="Vista previa" description="Así verá el público la identidad publicada.">
        <Button type="button" variant="outline" size="sm" className="rounded-xl mb-3" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
          {showPreview ? "Ocultar vista previa" : "Mostrar vista previa"}
        </Button>
        {showPreview && (
          <div className="rounded-2xl border border-border overflow-hidden">
            {(form.cover.desktopUrl || form.cover.mobileUrl || form.hero.title) && (
              <div className="relative">
                {(form.cover.desktopUrl || form.cover.mobileUrl) && (
                  <img src={optimizeImageUrl(form.cover.desktopUrl || form.cover.mobileUrl, { width: 1200 })} alt="" className="w-full aspect-[16/6] object-cover" style={{ objectPosition: form.cover.focus }} />
                )}
                <div className="p-5 text-center bg-card">
                  {form.hero.title && <h2 className="font-display text-2xl font-bold">{form.hero.title}</h2>}
                  {form.hero.subtitle && <p className="text-muted-foreground mt-1">{form.hero.subtitle}</p>}
                </div>
              </div>
            )}
            <div className="p-5 space-y-3">
              {form.story.title && <h3 className="font-display text-xl font-bold">{form.story.title}</h3>}
              {form.story.html && (
                <div className="prose-sm text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: form.story.html }} />
              )}
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                {form.mission && <div><p className="font-semibold">Misión</p><p className="text-muted-foreground">{form.mission}</p></div>}
                {form.vision && <div><p className="font-semibold">Visión</p><p className="text-muted-foreground">{form.vision}</p></div>}
              </div>
              {form.values.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {form.values.map((v, i) => <li key={i}>{v.title}{v.description ? ` — ${v.description}` : ""}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── Barra de acciones fija ───────────────────────────────── */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 z-20 bg-card/95 backdrop-blur border-t border-border px-4 sm:px-8 py-3">
        <div className="max-w-4xl flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={onSave}>
            {saveDraft.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Guardar borrador
          </Button>
          <Button type="button" className="rounded-xl" disabled={busy} onClick={onPublish}>
            {publish.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Publicar
          </Button>
          {isPublished && (
            <Button type="button" variant="ghost" className="rounded-xl text-destructive hover:bg-destructive/10" disabled={busy} onClick={onUnpublish}>
              <EyeOff className="w-4 h-4 mr-1" /> Despublicar
            </Button>
          )}
          <p className="text-xs text-muted-foreground sm:ml-auto">
            Guardar no publica. La web cambia solo al pulsar «Publicar».
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5 mb-5">
      <h2 className="font-display font-bold text-lg">{title}</h2>
      {description && <p className="text-sm text-muted-foreground mt-0.5 mb-4">{description}</p>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}
