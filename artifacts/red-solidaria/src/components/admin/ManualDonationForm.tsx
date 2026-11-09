import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadImageToCloudinary, validateProofImage, type UploadedImage } from "@/lib/cloudinary-upload";
import { newDedupeToken } from "@/lib/donation-submit";

interface Campaign { id: number; title: string; status: string }
interface Props { campaigns: Campaign[]; onSaved: (id: number) => void; onCancel: () => void; onLockChange?: (locked: boolean) => void }
interface Photo extends UploadedImage { mimeType: string }
interface Preview { message: string; imageUrl: string | null; link: string | null }
const initial = { firstName: "", lastName: "", email: "", phone: "", amount: "", paymentMethod: "cash", collaborationType: "dinero", product: "panetones", productOther: "", quantity: "1", unit: "unidad", estimatedValue: "", campaignId: "", message: "", publicationTemplate: "agradecimiento", publicNameConsent: false, publicPhotoConsent: false };

export function ManualDonationForm({ campaigns, onSaved, onCancel, onLockChange }: Props) {
  const [form, setForm] = useState(initial);
  const [proof, setProof] = useState<Photo | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Retain the exact request on an ambiguous failure; retry cannot create a duplicate.
  const retryPayload = useRef<Record<string, unknown> | null>(null);
  const busy = useRef(false);
  const [retryLocked, setRetryLocked] = useState(false);
  const locked = saving || uploading !== null || retryLocked || previewing;
  useEffect(() => { onLockChange?.(locked); }, [locked, onLockChange]);
  const money = form.collaborationType === "dinero";
  const products = form.collaborationType === "productos";
  const change = (key: keyof typeof initial, value: string | boolean) => {
    setForm(current => ({ ...current, [key]: value })); setPreview(null);
  };

  async function upload(file: File, target: "proof" | "photo") {
    if (busy.current || locked) return;
    const invalid = validateProofImage(file);
    if (invalid) { setError(invalid === "size" ? "La imagen no puede superar 8 MB." : "Usa una imagen JPG, PNG o WebP."); return; }
    busy.current = true; setUploading(target); setError(""); setPreview(null);
    try {
      const result = await uploadImageToCloudinary(file, "/api/uploads/admin-signature");
      const image = { ...result, mimeType: file.type };
      if (target === "proof") setProof(image); else setPhoto(image);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo subir la imagen. Vuelve a intentarlo."); }
    finally { busy.current = false; setUploading(null); }
  }

  async function showPreview() {
    if (busy.current) return;
    busy.current = true; setPreviewing(true); setError("");
    try {
      const response = await fetch("/api/admin/integrations/facebook/donation-preview", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: money ? Number(form.amount) : 0, collaborationType: form.collaborationType,
          campaignId: form.campaignId ? Number(form.campaignId) : null,
          campaignTitle: campaigns.find(c => String(c.id) === form.campaignId)?.title ?? null,
          recognitionName: form.publicNameConsent ? `${form.firstName.trim()} ${form.lastName.trim()}`.trim() || null : null,
          publicationTemplate: form.publicationTemplate,
          publicationImageUrl: form.publicPhotoConsent ? photo?.imageUrl ?? null : null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo preparar la vista previa.");
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo preparar la vista previa."); }
    finally { busy.current = false; setPreviewing(false); }
  }

  async function submit() {
    if (busy.current) return;
    if (photo && !form.publicPhotoConsent) { setError("Autoriza el uso de la foto pública o retírala antes de guardar."); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      retryPayload.current ??= {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        email: form.email.trim() || `registro-${newDedupeToken()}@sin-correo.redsolidaria.invalid`,
        phone: form.phone.trim() || undefined,
        amount: money ? Number(form.amount) : 0,
        paymentMethod: money ? form.paymentMethod : undefined,
        collaborationType: form.collaborationType,
        items: products ? [{ product: form.product, productOther: form.product === "otros" ? form.productOther.trim() : undefined,
          quantity: Number(form.quantity), unit: form.unit, estimatedValue: Number(form.estimatedValue || 0) }] : undefined,
        campaignId: form.campaignId ? Number(form.campaignId) : null,
        message: !money && !products ? form.message.trim() : undefined,
        adminNote: form.message.trim() || undefined,
        anonymous: !form.publicNameConsent, publicProof: false, contactConsent: false,
        proofImageUrl: proof?.imageUrl, proofPublicId: proof?.publicId, proofMimeType: proof?.mimeType,
        publicationTemplate: form.publicationTemplate,
        publicationImageUrl: photo?.imageUrl, publicationImagePublicId: photo?.publicId,
        publicPhotoConsent: form.publicPhotoConsent,
        dedupeToken: newDedupeToken(),
      };
      setRetryLocked(true);
      const response = await fetch("/api/donations", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(retryPayload.current) });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status < 500 && response.status !== 408) { retryPayload.current = null; setRetryLocked(false); }
        throw new Error(result?.message || "No se pudo registrar el aporte.");
      }
      if (!Number.isSafeInteger(result?.id) || result.id <= 0) throw new Error("No recibimos la confirmación del registro.");
      retryPayload.current = null; setRetryLocked(false);
      onSaved(result.id);
    } catch (e) { setError(e instanceof TypeError ? "No pudimos confirmar el registro por un fallo de conexión. Reintenta el mismo envío." : e instanceof Error ? e.message : "No se pudo confirmar el registro. Reintenta el mismo envío."); }
    finally { busy.current = false; setSaving(false); }
  }

  const imageField = (target: "proof" | "photo", image: Photo | null, title: string) => (
    <div className="space-y-2 rounded-xl border p-3">
      <label className="block text-sm font-medium">{title}
        <Input type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} className="mt-2"
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file, target); }} />
      </label>
      <p className="text-xs text-muted-foreground">JPG, PNG o WebP · máximo 8 MB.</p>
      {uploading === target && <p role="status">Subiendo imagen…</p>}
      {image && <div className="flex items-center gap-3"><img src={image.imageUrl} alt={title} className="h-24 w-24 rounded-lg object-contain" />
        <Button type="button" variant="outline" disabled={locked} onClick={() => { if (target === "proof") setProof(null); else setPhoto(null); setPreview(null); }}>Quitar {target === "proof" ? "comprobante" : "foto"}</Button></div>}
    </div>
  );

  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <fieldset disabled={locked} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-sm">Nombres<Input required minLength={2} maxLength={100} value={form.firstName} onChange={e => change("firstName", e.target.value)} /></label>
      <label className="text-sm">Apellidos<Input required minLength={2} maxLength={100} value={form.lastName} onChange={e => change("lastName", e.target.value)} /></label>
      <label className="text-sm">Correo (opcional)<Input type="email" maxLength={200} value={form.email} onChange={e => change("email", e.target.value)} /></label>
      <label className="text-sm">WhatsApp (opcional)<Input value={form.phone} onChange={e => change("phone", e.target.value)} placeholder="9 dígitos o +51" /></label>
      <label className="text-sm">Tipo de aporte<select className="h-10 w-full rounded-lg border bg-background px-2" value={form.collaborationType} onChange={e => change("collaborationType", e.target.value)}>
        <option value="dinero">Dinero</option><option value="productos">Productos</option><option value="servicios">Servicios</option><option value="logistica">Apoyo logístico</option>
      </select></label>
      <label className="text-sm">Campaña<select className="h-10 w-full rounded-lg border bg-background px-2" value={form.campaignId} onChange={e => change("campaignId", e.target.value)}>
        <option value="">Fondo general</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select></label>
      {money && <>
        <label className="text-sm">Monto recibido (S/)<Input type="number" min="5" step="0.01" required value={form.amount} onChange={e => change("amount", e.target.value)} /></label>
        <label className="text-sm">Medio de recepción<select className="h-10 w-full rounded-lg border bg-background px-2" value={form.paymentMethod} onChange={e => change("paymentMethod", e.target.value)}>
          <option value="cash">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="transfer">Transferencia</option><option value="other">Otro / coordinado</option>
        </select></label>
      </>}
      {products && <>
        <label className="text-sm">Producto<select className="h-10 w-full rounded-lg border bg-background px-2" value={form.product} onChange={e => change("product", e.target.value)}>
          {["panetones", "leche", "chocolate", "arroz", "azucar", "aceite", "juguetes", "ropa", "otros"].map(p => <option key={p} value={p}>{p}</option>)}
        </select></label>
        {form.product === "otros" && <label className="text-sm">Describe el producto<Input required minLength={2} maxLength={60} value={form.productOther} onChange={e => change("productOther", e.target.value)} /></label>}
        <label className="text-sm">Cantidad<Input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={e => change("quantity", e.target.value)} /></label>
        <label className="text-sm">Unidad<select className="h-10 w-full rounded-lg border bg-background px-2" value={form.unit} onChange={e => change("unit", e.target.value)}>
          {["unidad", "caja", "paquete", "saco", "kilogramo", "litro"].map(u => <option key={u}>{u}</option>)}
        </select></label>
        <label className="text-sm">Valor estimado (S/, opcional)<Input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={e => change("estimatedValue", e.target.value)} /></label>
      </>}
      <label className="text-sm sm:col-span-2">{!money && !products ? "Describe el servicio o apoyo logístico" : "Nota privada para el equipo"}
        <Textarea required={!money && !products} minLength={!money && !products ? 10 : undefined} maxLength={1000} value={form.message} onChange={e => change("message", e.target.value)} />
      </label>
    </fieldset>
    {imageField("proof", proof, "Comprobante privado (opcional al registrar)")}
    <p className="text-xs text-muted-foreground">El comprobante se guarda con el aporte y nunca se usa como foto de Facebook. Yape, Plin y transferencia requieren comprobante antes de aprobar.</p>
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Publicación en Facebook</h3>
      <label className="block text-sm">Plantilla de publicación<select disabled={locked} className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={form.publicationTemplate} onChange={e => change("publicationTemplate", e.target.value)}>
        <option value="agradecimiento">Agradecimiento</option><option value="impacto">Impacto solidario</option><option value="comunidad">Invitación a la comunidad</option>
      </select></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" disabled={locked} checked={form.publicNameConsent} onChange={e => change("publicNameConsent", e.target.checked)} />El donante autorizó expresamente publicar su nombre en la web y Facebook.</label>
      {imageField("photo", photo, "Foto pública para Facebook (opcional)")}
      <label className="flex gap-2 text-sm"><input type="checkbox" disabled={locked} checked={form.publicPhotoConsent} onChange={e => change("publicPhotoConsent", e.target.checked)} />Cuento con autorización para publicar esta foto en reconocimientos y Facebook.</label>
      <Button type="button" variant="outline" disabled={locked || previewing} onClick={() => void showPreview()}>{previewing ? "Preparando…" : "Ver plantilla con estos datos"}</Button>
      {preview && <div className="space-y-2 rounded-lg bg-secondary/40 p-3" data-testid="donation-draft-preview">
        {preview.imageUrl && <img src={preview.imageUrl} alt="Foto de la publicación" className="max-h-48 rounded-lg" />}
        <p className="whitespace-pre-wrap text-sm">{preview.message}</p>
        {preview.link && <a href={preview.link} target="_blank" rel="noreferrer" className="text-sm underline">Ver destino público</a>}
      </div>}
      <p className="text-xs text-muted-foreground">Esta es una vista previa. Se publica al aprobar el dinero o verificar la entrega en especie. El servidor revisa el consentimiento al enviar; las cantidades de productos serán las realmente recibidas. Sin foto pública se usará la portada de la campaña, si existe.</p>
    </div>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {retryLocked && !saving && <p className="text-sm">El resultado anterior no se pudo confirmar. Reintenta el mismo envío para recuperar el registro sin duplicarlo.</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" disabled={locked} onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={saving || uploading !== null || previewing}>{saving ? "Guardando…" : retryLocked ? "Reintentar el mismo registro" : "Guardar como pendiente"}</Button>
    </div>
  </form>;
}
