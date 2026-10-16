import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Loader2,
  Monitor,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  CmsImageField,
  emptyCmsImage,
  type CmsImageValue,
} from "@/components/admin/CmsImageField";
import {
  useAdminCmsPage,
  useCmsVersions,
  useDiscardCmsAssets,
  usePublishCmsPage,
  useRestoreCmsVersion,
  useSaveCmsDraft,
  useScheduleCmsPage,
  useUnpublishCmsPage,
  type CmsDraftBlock,
  type CmsDraftContent,
  type CmsFieldSchema,
} from "@/hooks/use-cms-page";
import { errorMessage } from "@/lib/api-error";

/**
 * Editor de páginas del CMS (Fase 3).
 *
 * Cubre: vista previa escritorio/móvil (iframe con `?cmsPreview=1`, que lee el
 * BORRADOR), guardar borrador, publicar, despublicar, programar, historial de versiones,
 * restaurar, reordenar bloques y activar/desactivar. Los campos se generan a partir del
 * esquema que devuelve el servidor, que es la misma ALLOWLIST que valida al guardar: la
 * interfaz no puede inventar campos.
 */

/** Etiquetas legibles de los campos (el esquema solo manda el nombre técnico). */
const FIELD_LABELS: Record<string, string> = {
  eyebrow: "Antetítulo",
  title: "Título",
  titleAccent: "Título (2.ª línea)",
  subtitle: "Subtítulo",
  ctaLabel: "Texto del botón",
  ctaHref: "Enlace del botón",
  ctaLabel2: "Texto del 2.º botón",
  ctaHref2: "Enlace del 2.º botón",
  heading: "Encabezado",
  html: "Texto (HTML básico)",
  image: "Imagen",
  imagePosition: "Posición de la imagen",
  items: "Elementos",
  label: "Etiqueta",
  description: "Descripción",
  href: "Enlace",
  tagline: "Lema",
  address: "Dirección",
  transparencyText: "Texto de transparencia",
  links: "Enlaces",
};

/** Ruta pública de cada página, para la vista previa. */
const PREVIEW_PATH: Record<string, string> = {
  inicio: "/",
  historia: "/nosotros",
  menu: "/",
};

function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

function defaultValue(field: CmsFieldSchema): unknown {
  switch (field.kind) {
    case "text":
    case "richText":
    case "url":
      return { es: "", en: "" };
    case "image":
      return emptyCmsImage();
    case "enum":
      return "";
    case "list":
      return [];
    default:
      return null;
  }
}

function bilingual(value: unknown): { es: string; en: string } {
  const r = (value ?? {}) as { es?: unknown; en?: unknown };
  return {
    es: typeof r.es === "string" ? r.es : "",
    en: typeof r.en === "string" ? r.en : "",
  };
}

function assetValue(value: unknown): CmsImageValue {
  const r = (value ?? {}) as Partial<CmsImageValue>;
  return {
    url: typeof r.url === "string" ? r.url : "",
    publicId: typeof r.publicId === "string" ? r.publicId : null,
    alt: r.alt ?? { es: "", en: "" },
    focus: typeof r.focus === "string" && r.focus ? r.focus : "50% 50%",
    ratio: typeof r.ratio === "string" ? r.ratio : "",
  };
}

export default function AdminPageEditor() {
  const params = useParams<{ slug: string }>();
  const slug = (params.slug ?? "").trim();

  const { data, isLoading, isError, error } = useAdminCmsPage(slug);
  const saveDraft = useSaveCmsDraft(slug);
  const publish = usePublishCmsPage(slug);
  const unpublish = useUnpublishCmsPage(slug);
  const schedule = useScheduleCmsPage(slug);
  const restore = useRestoreCmsVersion(slug);
  const discard = useDiscardCmsAssets(slug);
  const versions = useCmsVersions(slug);

  const [draft, setDraft] = useState<CmsDraftContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const [scheduleAt, setScheduleAt] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [syncedVersion, setSyncedVersion] = useState<number | null>(null);

  // Sincroniza el borrador del servidor SOLO cuando no hay ediciones locales sin
  // guardar: así una recarga en segundo plano no pisa lo que el admin está escribiendo.
  useEffect(() => {
    if (!data) return;
    if (syncedVersion === null || (!dirtyRef.current && data.version !== syncedVersion)) {
      setDraft(data.draft);
      setSyncedVersion(data.version);
    }
  }, [data, syncedVersion]);

  const blocks = draft?.blocks ?? [];
  const blockSchema = data?.blocks ?? [];

  const schemaFor = (type: string) => blockSchema.find((block) => block.type === type);

  const updateBlocks = (next: CmsDraftBlock[]) => {
    setDraft({ blocks: next.map((block, index) => ({ ...block, order: index })) });
    setDirty(true);
    setMessage(null);
  };

  const setField = (type: string, field: string, value: unknown) => {
    updateBlocks(
      blocks.map((block) =>
        block.type === type ? { ...block, fields: { ...block.fields, [field]: value } } : block,
      ),
    );
  };

  const toggleBlock = (type: string) => {
    updateBlocks(
      blocks.map((block) => (block.type === type ? { ...block, enabled: !block.enabled } : block)),
    );
  };

  const moveBlock = (type: string, direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.type === type);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    updateBlocks(next);
  };

  const runMutation = async <T,>(
    fn: () => Promise<T>,
    okText: string,
  ): Promise<T | null> => {
    try {
      const result = await fn();
      setDirty(false);
      setMessage({ kind: "ok", text: okText });
      return result;
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "No se pudo completar la operación.") });
      return null;
    }
  };

  const busy =
    saveDraft.isPending || publish.isPending || unpublish.isPending || schedule.isPending || restore.isPending;

  if (!slug) {
    return <div className="p-8 text-sm text-muted-foreground">Página no indicada.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando la página…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {errorMessage(error, "No se pudo cargar la página.")}
        </div>
        <Link href="/admin/contenido" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Volver al listado
        </Link>
      </div>
    );
  }

  const previewPath = PREVIEW_PATH[slug] ?? "/";
  const version = data.version;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/contenido" className="text-xs font-semibold text-primary">
            ← Editor de páginas
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">{data.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">v{version}</Badge>
            <StatusPill status={data.status} />
            {dirty ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Cambios sin guardar
              </span>
            ) : data.hasPendingChanges ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Borrador con cambios pendientes de publicar
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Todo publicado
              </span>
            )}
            {!data.wired && (
              <Badge variant="secondary" className="text-[10px]">
                Pendiente de conectar a la web
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={busy || !draft}
            onClick={() =>
              draft &&
              runMutation(
                () => saveDraft.mutateAsync({ content: draft, version }),
                "Borrador guardado.",
              )
            }
          >
            {saveDraft.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Guardar borrador
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={busy || !draft}
            onClick={() =>
              draft &&
              runMutation(
                () => publish.mutateAsync({ content: draft, version }),
                "Publicado correctamente.",
              ).then((result) => result && setPreviewKey((k) => k + 1))
            }
          >
            {publish.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Publicar
          </Button>
          {data.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={busy}
              onClick={() =>
                runMutation(() => unpublish.mutateAsync({ version }), "Página despublicada.").then(
                  (result) => result && setPreviewKey((k) => k + 1),
                )
              }
            >
              <XCircle className="mr-1 h-4 w-4" /> Despublicar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg"
            onClick={() => setShowHistory((current) => !current)}
          >
            <History className="mr-1 h-4 w-4" /> Historial
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-xl border p-3 text-sm ${
            message.kind === "ok"
              ? "border-green-600/30 bg-green-600/5 text-green-700"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Historial de versiones ──────────────────────────────────────── */}
      {showHistory && (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Historial de versiones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {(versions.data?.versions ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay versiones guardadas.</p>
            )}
            {(versions.data?.versions ?? []).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs"
              >
                <span className="text-muted-foreground">
                  <strong className="text-foreground">v{entry.version}</strong> · {entry.action} ·{" "}
                  {new Date(entry.createdAt).toLocaleString("es-PE")}
                  {entry.createdBy ? ` · ${entry.createdBy}` : ""}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={busy}
                  onClick={() =>
                    runMutation(
                      () => restore.mutateAsync({ versionId: entry.id, version }),
                      `Versión v${entry.version} restaurada como borrador.`,
                    )
                  }
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-6 ${showPreview ? "xl:grid-cols-2" : ""}`}>
        {/* ── Bloques ───────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {blocks.map((block, index) => {
            const schema = schemaFor(block.type);
            return (
              <Card key={block.type} className={block.enabled ? "" : "opacity-60"}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span>{schema?.label ?? block.type}</span>
                    {schema?.reference && (
                      <Badge variant="secondary" className="text-[10px]">
                        Datos reales · no editables
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Subir bloque"
                      disabled={index === 0}
                      onClick={() => moveBlock(block.type, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Bajar bloque"
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(block.type, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={block.enabled ? "outline" : "secondary"}
                      size="sm"
                      className="rounded-lg"
                      onClick={() => toggleBlock(block.type)}
                    >
                      {block.enabled ? (
                        <>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Visible
                        </>
                      ) : (
                        <>
                          <EyeOff className="mr-1 h-3.5 w-3.5" /> Oculto
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {schema?.fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      page={slug}
                      field={field}
                      value={block.fields[field.name]}
                      onChange={(value) => setField(block.type, field.name, value)}
                      onDiscard={(publicId) => discard.mutate([publicId])}
                    />
                  ))}
                  {!schema && (
                    <p className="text-xs text-muted-foreground">Bloque sin esquema conocido.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* ── Programar publicación ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Programar publicación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted-foreground">
                Fecha y hora
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="mt-1 rounded-lg"
                />
              </label>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={busy || !draft || !scheduleAt}
                onClick={() =>
                  draft &&
                  scheduleAt &&
                  runMutation(
                    () =>
                      schedule.mutateAsync({
                        content: draft,
                        version,
                        scheduledAt: new Date(scheduleAt).toISOString(),
                      }),
                    "Publicación programada.",
                  )
                }
              >
                Programar
              </Button>
              {data.scheduledAt && (
                <p className="text-xs text-amber-700">
                  Programado para {new Date(data.scheduledAt).toLocaleString("es-PE")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Vista previa ─────────────────────────────────────────────── */}
        {showPreview && (
          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Vista previa del borrador</p>
              <div className="flex items-center gap-1">
                <Button
                  variant={device === "desktop" ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setDevice("desktop")}
                >
                  <Monitor className="mr-1 h-3.5 w-3.5" /> Escritorio
                </Button>
                <Button
                  variant={device === "mobile" ? "default" : "outline"}
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setDevice("mobile")}
                >
                  <Smartphone className="mr-1 h-3.5 w-3.5" /> Móvil
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setShowPreview(false)}
                >
                  Ocultar
                </Button>
              </div>
            </div>
            <div className="flex justify-center rounded-xl border border-border bg-secondary/20 p-2">
              <iframe
                key={`${device}-${previewKey}`}
                title="Vista previa"
                src={`${previewPath}?cmsPreview=1`}
                className="h-[70vh] rounded-lg border border-border bg-white"
                style={{ width: device === "mobile" ? 390 : "100%" }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              La vista previa muestra el BORRADOR (no lo publicado). Guarda o publica para
              conservarlo.
            </p>
          </div>
        )}

        {!showPreview && (
          <div>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setShowPreview(true)}>
              <Eye className="mr-1 h-4 w-4" /> Mostrar vista previa
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "published") {
    return (
      <Badge className="bg-green-600 text-[10px] text-white hover:bg-green-600">Publicado</Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge className="bg-amber-500 text-[10px] text-white hover:bg-amber-500">Programado</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Borrador
    </Badge>
  );
}

interface FieldInputProps {
  page: string;
  field: CmsFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  onDiscard: (publicId: string) => void;
}

/** Renderiza el input correcto según el TIPO de campo del esquema del servidor. */
function FieldInput({ page, field, value, onChange, onDiscard }: FieldInputProps) {
  if (field.kind === "image") {
    return (
      <CmsImageField
        page={page}
        label={fieldLabel(field.name)}
        value={assetValue(value)}
        onChange={(next) => onChange(next)}
        onDiscard={onDiscard}
      />
    );
  }

  if (field.kind === "enum") {
    return (
      <label className="block text-xs text-muted-foreground">
        {fieldLabel(field.name)}
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Por defecto</option>
          {(field.values ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "list") {
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-sm font-medium">{fieldLabel(field.name)}</p>
        {items.map((item, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-border/60 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Subir elemento"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...items];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Bajar elemento"
                  disabled={index === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    onChange(next);
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  aria-label="Quitar elemento"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {(field.fields ?? []).map((subField) => (
              <FieldInput
                key={subField.name}
                page={page}
                field={subField}
                value={item[subField.name]}
                onChange={(nextValue) =>
                  onChange(
                    items.map((current, i) =>
                      i === index ? { ...current, [subField.name]: nextValue } : current,
                    ),
                  )
                }
                onDiscard={onDiscard}
              />
            ))}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => {
            const empty: Record<string, unknown> = {};
            for (const subField of field.fields ?? []) empty[subField.name] = defaultValue(subField);
            onChange([...items, empty]);
          }}
        >
          Añadir elemento
        </Button>
      </div>
    );
  }

  // text | richText | url → bilingüe
  const current = bilingual(value);
  const setLocale = (locale: "es" | "en", text: string) =>
    onChange({ ...current, [locale]: text });

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{fieldLabel(field.name)}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Español
          {field.kind === "richText" ? (
            <Textarea
              value={current.es}
              rows={4}
              onChange={(event) => setLocale("es", event.target.value)}
              className="mt-1 rounded-lg bg-background text-sm"
            />
          ) : (
            <Input
              value={current.es}
              onChange={(event) => setLocale("es", event.target.value)}
              className="mt-1 rounded-lg bg-background text-sm"
              placeholder={field.kind === "url" ? "/ruta o https://…" : undefined}
            />
          )}
        </label>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Inglés
          {field.kind === "richText" ? (
            <Textarea
              value={current.en}
              rows={4}
              onChange={(event) => setLocale("en", event.target.value)}
              className="mt-1 rounded-lg bg-background text-sm"
            />
          ) : (
            <Input
              value={current.en}
              onChange={(event) => setLocale("en", event.target.value)}
              className="mt-1 rounded-lg bg-background text-sm"
            />
          )}
        </label>
      </div>
    </div>
  );
}
