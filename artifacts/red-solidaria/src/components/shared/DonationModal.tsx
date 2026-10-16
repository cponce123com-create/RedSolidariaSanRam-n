import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gift,
  HandHeart,
  Heart,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import confetti from "canvas-confetti";
import {
  DONATION_UNITS,
  MAX_ITEMS,
  MAX_ITEM_DESCRIPTION,
  MAX_OTHER_PRODUCT,
  OTHER_PRODUCT,
  PRODUCT_CATALOG,
  emptyDonationItem,
  itemSummary,
  toDonationItemsPayload,
  type DonationItemDraft,
} from "@/lib/donation-products";
import { isValidPePhone, normalizePePhone } from "@/lib/phone";
import {
  DonationSubmitError,
  newDedupeToken,
  submitDonation,
} from "@/lib/donation-submit";

/**
 * Formulario público de donación (V20).
 *
 * ── FASE 1: LA CAUSA RAÍZ DEL MODAL QUE NO CERRABA ──────────────────────────
 * Antes se montaba `onOpenChange={open ? undefined : resetAndClose}`: con el
 * diálogo ABIERTO el manejador quedaba en `undefined`, así que Radix no tenía a
 * quién pedir el cierre y la X, la tecla Escape y el clic fuera NO hacían nada.
 *
 * Ahora hay SIEMPRE un manejador (`handleOpenChange`) que pasa por `requestClose`:
 *   · sin datos introducidos → cierra directamente;
 *   · con datos → pide confirmación antes de descartarlos;
 *   · tras enviar → cierra sin preguntar (el aporte ya está guardado);
 *   · mientras se envía → no cierra (evita perder el envío a medias).
 * Así el modal no puede quedar bloqueado: cualquier gesto de cierre tiene salida.
 *
 * ── FASE 2: DOS PASOS ───────────────────────────────────────────────────────
 * Paso 1: qué donas (dinero / productos / servicios). Paso 2: tus datos.
 * Se bloquea ÚNICAMENTE el botón de envío mientras se procesa; el resto sigue
 * accesible. En móvil ocupa toda la pantalla y solo el cuerpo hace scroll, con
 * cabecera y pie siempre visibles.
 */
type CollaborationChoice = "dinero" | "productos" | "servicios";
type ServiceKind = "servicios" | "logistica";
type PaymentMethod = "yape" | "plin" | "transfer" | "other";

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: number;
  campaignTitle?: string;
  /** Producto preseleccionado (botón «Quiero donar esto» de Necesidades). */
  preselectProduct?: string;
}

const QUICK_AMOUNTS = [10, 20, 50, 100];
const MIN_AMOUNT = 5;

const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "yape", label: "Yape", hint: "Al 921 615 737" },
  { value: "plin", label: "Plin", hint: "Al 921 615 737" },
  { value: "transfer", label: "Transferencia", hint: "BCP 193-12345678-0-55" },
  { value: "other", label: "Otro medio", hint: "Coordinamos contigo" },
];

function triggerConfetti() {
  const duration = 2500;
  const end = Date.now() + duration;
  const interval = window.setInterval(() => {
    if (Date.now() > end) {
      window.clearInterval(interval);
      return;
    }
    confetti({ particleCount: 40, spread: 360, startVelocity: 30, zIndex: 10000 });
  }, 250);
}

export function DonationModal({
  open,
  onClose,
  campaignId,
  campaignTitle,
  preselectProduct,
}: DonationModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [choice, setChoice] = useState<CollaborationChoice>("dinero");
  const [serviceKind, setServiceKind] = useState<ServiceKind>("servicios");
  const [amount, setAmount] = useState("50");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("yape");
  const [items, setItems] = useState<DonationItemDraft[]>([emptyDonationItem()]);
  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [contactConsent, setContactConsent] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; trackingCode: string | null } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dedupeTokenRef = useRef<string>(newDedupeToken());

  // Al abrir: clave de idempotencia nueva y formulario limpio (restauración
  // correcta tras cerrar o finalizar).
  useEffect(() => {
    if (!open) return;
    dedupeTokenRef.current = newDedupeToken();
    setStep(1);
    setChoice("dinero");
    setServiceKind("servicios");
    setAmount("50");
    setPaymentMethod("yape");
    setItems([{ ...emptyDonationItem(), product: preselectProduct || "panetones" }]);
    setMessage("");
    setFullName("");
    setPhone("");
    setEmail("");
    setOrgName("");
    setAnonymous(false);
    setContactConsent(true);
    setErrors({});
    setSubmitError(null);
    setResult(null);
    setConfirmDiscard(false);
  }, [open, preselectProduct]);

  // ¿Hay datos que se perderían al cerrar?
  const hasEnteredData =
    step === 2 ||
    choice !== "dinero" ||
    amount !== "50" ||
    message.trim() !== "" ||
    fullName.trim() !== "" ||
    phone.trim() !== "" ||
    email.trim() !== "" ||
    orgName.trim() !== "" ||
    anonymous ||
    !contactConsent ||
    items.length > 1 ||
    items.some(
      (item) =>
        item.product !== (preselectProduct || "panetones") ||
        item.productOther !== "" ||
        item.quantity !== "1" ||
        item.description !== "" ||
        item.estimatedValue !== "",
    );

  /** Cierre real: restaura el formulario y avisa al padre. */
  const hardClose = () => {
    setConfirmDiscard(false);
    setStep(1);
    setResult(null);
    setSubmitting(false);
    onClose();
  };

  /**
   * Única puerta de cierre (X, Escape, clic fuera, «Cancelar»). Nunca se deja el
   * diálogo sin manejador, así que nunca queda bloqueado.
   */
  const requestClose = () => {
    if (submitting) return; // no se pierde un envío a medias
    if (result) {
      hardClose(); // ya está guardado: cerrar sin preguntar
      return;
    }
    if (hasEnteredData) {
      setConfirmDiscard(true);
      return;
    }
    hardClose();
  };

  const handleOpenChange = (next: boolean) => {
    if (next) return; // solo gestionamos el cierre
    requestClose();
  };

  const updateItem = (index: number, patch: Partial<DonationItemDraft>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const validateStep1 = (): boolean => {
    const next: Record<string, string> = {};
    if (choice === "dinero") {
      const value = Number(amount);
      if (!Number.isFinite(value) || value < MIN_AMOUNT) {
        next.amount = `El monto mínimo es S/ ${MIN_AMOUNT}.`;
      } else if (Math.abs(value * 100 - Math.round(value * 100)) >= 1e-8) {
        // Sin redondeo silencioso: 50.123 no es 50.12. Misma regla que el servidor.
        next.amount = "El monto admite máximo 2 decimales.";
      }
    }
    if (choice === "productos") {
      if (items.length === 0) next.items = "Añade al menos un producto.";
      items.forEach((item, index) => {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          next[`item-${index}-quantity`] = "La cantidad debe ser mayor que cero.";
        }
        if (item.product === OTHER_PRODUCT && item.productOther.trim().length < 2) {
          next[`item-${index}-product`] = "Escribe qué producto donas.";
        }
      });
    }
    if (choice === "servicios" && message.trim().length < 10) {
      next.message = "Describe brevemente tu colaboración (al menos 10 caracteres).";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateStep2 = (): boolean => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 4) next.fullName = "Escribe tu nombre y apellido.";
    if (!isValidPePhone(phone)) next.phone = "Escribe un WhatsApp peruano válido (9 dígitos).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Escribe un correo válido para enviarte tu constancia.";
    }
    if (!contactConsent) next.contactConsent = "Necesitamos tu autorización para coordinar el aporte.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setErrors({});
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validateStep2()) return;

    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName;
    const collaborationType =
      choice === "servicios" ? serviceKind : choice === "productos" ? "productos" : "dinero";

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await submitDonation({
        campaignId: campaignId ?? null,
        firstName,
        lastName,
        email: email.trim(),
        phone: normalizePePhone(phone),
        orgName: orgName.trim() || undefined,
        collaborationType,
        amount: choice === "dinero" ? Number(amount) : 0,
        paymentMethod: choice === "dinero" ? paymentMethod : undefined,
        message: message.trim() || undefined,
        anonymous,
        contactConsent,
        items: choice === "productos" ? toDonationItemsPayload(items) : undefined,
        dedupeToken: dedupeTokenRef.current,
      });

      setResult({ id: created.id, trackingCode: created.trackingCode ?? null });
      triggerConfetti();
      // Sincronización (Fase 10): el aporte nuevo aparece en el panel y en las
      // vistas de campaña sin recargar.
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/donations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/donations/stats"] });
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/donations`] });
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/donors`] });
      }
    } catch (err) {
      setSubmitError(
        err instanceof DonationSubmitError
          ? err.message
          : "No pudimos registrar tu donación. Inténtalo de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="donation-modal"
        // Altura y scroll (Fase 1.7): en móvil ocupa la pantalla completa y en
        // escritorio queda acotada; SOLO el cuerpo hace scroll, así el título y
        // los botones siempre se ven.
        className="flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:max-w-[620px] sm:rounded-3xl"
      >
        {result ? (
          // ── Éxito ───────────────────────────────────────────────────────────
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="font-display text-2xl font-bold">
                ¡Gracias por sumarte{campaignTitle ? ` a ${campaignTitle}` : ""}!
              </DialogTitle>
              <DialogDescription className="text-base text-muted-foreground">
                Hemos recibido tu solicitud. Nos comunicaremos contigo para coordinar tu aporte.
              </DialogDescription>
            </DialogHeader>
            {result.trackingCode && (
              <div className="w-full rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Código de seguimiento
                </p>
                <p
                  className="mt-1 font-display text-2xl font-bold tracking-widest text-primary"
                  data-testid="donation-tracking-code"
                >
                  {result.trackingCode}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Guárdalo: con él podemos ubicar tu aporte.
                </p>
              </div>
            )}
            {choice === "dinero" && (
              <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
                Tu aporte queda <strong>registrado como solicitud pendiente</strong>. Se sumará al
                total cuando verifiquemos la recepción del pago.
              </p>
            )}
            <Button
              onClick={hardClose}
              className="h-12 w-full rounded-xl text-base font-semibold"
              data-testid="btn-donation-close-success"
            >
              {t("donation.backButton")}
            </Button>
          </div>
        ) : (
          <>
            {/* ── Cabecera (fija) ──────────────────────────────────────────── */}
            <header className="shrink-0 border-b border-border/50 bg-primary/5 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="font-display text-xl font-bold sm:text-2xl">
                    {campaignTitle ? t("donation.title", { campaign: campaignTitle }) : t("donation.generalTitle")}
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Paso {step} de 2 ·{" "}
                    {step === 1 ? "¿Qué deseas donar?" : "Tus datos para coordinar"}
                  </DialogDescription>
                </DialogHeader>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Cerrar"
                  data-testid="btn-donation-close"
                  className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: step === 1 ? "50%" : "100%" }}
                />
              </div>
            </header>

            {/* ── Cuerpo (scroll) ──────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {confirmDiscard ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center" data-testid="donation-discard-confirm">
                  <AlertTriangle className="h-10 w-10 text-amber-500" />
                  <p className="font-semibold">¿Descartar tu donación?</p>
                  <p className="text-sm text-muted-foreground">
                    Si cierras ahora, perderás los datos que ya escribiste.
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button
                      variant="outline"
                      className="h-12 rounded-xl"
                      onClick={() => setConfirmDiscard(false)}
                      data-testid="btn-donation-keep-editing"
                    >
                      Seguir editando
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-12 rounded-xl"
                      onClick={hardClose}
                      data-testid="btn-donation-discard"
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              ) : step === 1 ? (
                <div className="space-y-6">
                  {/* 1 · ¿Qué deseas donar? */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        { value: "dinero", label: "Donar dinero", icon: Heart },
                        { value: "productos", label: "Donar productos", icon: Gift },
                        { value: "servicios", label: "Ofrecer servicios", icon: HandHeart },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setChoice(option.value)}
                        aria-pressed={choice === option.value}
                        data-testid={`choice-${option.value}`}
                        className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-3 py-3 text-sm font-semibold transition-all ${
                          choice === option.value
                            ? "border-primary bg-primary/5 text-primary shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        <option.icon className="h-5 w-5" />
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {/* 1a · Dinero */}
                  {choice === "dinero" && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="donation-amount" className="mb-2 block text-sm font-semibold">
                          Monto en soles
                        </label>
                        <Input
                          id="donation-amount"
                          type="number"
                          inputMode="decimal"
                          min={MIN_AMOUNT}
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          aria-invalid={Boolean(errors.amount)}
                          className="h-14 rounded-xl text-center text-2xl font-bold"
                          data-testid="donation-amount"
                        />
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {QUICK_AMOUNTS.map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={Number(amount) === value ? "default" : "outline"}
                              className="h-11 rounded-xl"
                              onClick={() => setAmount(String(value))}
                              data-testid={`quick-amount-${value}`}
                            >
                              S/ {value}
                            </Button>
                          ))}
                        </div>
                        {errors.amount && (
                          <p role="alert" className="mt-2 text-sm text-destructive">
                            {errors.amount}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-semibold">¿Cómo quieres aportar?</p>
                        <div className="grid grid-cols-2 gap-2">
                          {PAYMENT_METHODS.map((method) => (
                            <button
                              key={method.value}
                              type="button"
                              onClick={() => setPaymentMethod(method.value)}
                              aria-pressed={paymentMethod === method.value}
                              className={`rounded-2xl border-2 p-3 text-left transition-all ${
                                paymentMethod === method.value
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card hover:border-primary/40"
                              }`}
                            >
                              <span className="block text-sm font-bold">{method.label}</span>
                              <span className="block text-xs text-muted-foreground">{method.hint}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
                        Tu aporte queda <strong>pendiente</strong> hasta que verifiquemos la
                        recepción del pago: así no contamos una intención como dinero recaudado.
                      </p>
                    </div>
                  )}

                  {/* 1b · Productos */}
                  {choice === "productos" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">¿Qué productos donas?</p>
                        <span className="text-xs text-muted-foreground">
                          {items.length}/{MAX_ITEMS}
                        </span>
                      </div>

                      {items.map((item, index) => (
                        <div key={index} className="space-y-3 rounded-2xl border border-border p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Producto {index + 1}
                            </span>
                            {items.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Quitar producto ${index + 1}`}
                                className="h-8 w-8 text-destructive"
                                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          <select
                            value={item.product}
                            aria-label={`Producto ${index + 1}`}
                            onChange={(event) => updateItem(index, { product: event.target.value })}
                            className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
                          >
                            {PRODUCT_CATALOG.map((product) => (
                              <option key={product.value} value={product.value}>
                                {product.label}
                              </option>
                            ))}
                          </select>

                          {item.product === OTHER_PRODUCT && (
                            <Input
                              value={item.productOther}
                              maxLength={MAX_OTHER_PRODUCT}
                              placeholder="¿Qué producto es?"
                              onChange={(event) => updateItem(index, { productOther: event.target.value })}
                              className="h-12 rounded-xl"
                            />
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-xs text-muted-foreground">
                              Cantidad
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0.001"
                                step="any"
                                value={item.quantity}
                                onChange={(event) => updateItem(index, { quantity: event.target.value })}
                                className="mt-1 h-12 rounded-xl"
                              />
                            </label>
                            <label className="text-xs text-muted-foreground">
                              Unidad
                              <select
                                value={item.unit}
                                onChange={(event) =>
                                  updateItem(index, { unit: event.target.value as DonationItemDraft["unit"] })
                                }
                                className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
                              >
                                {DONATION_UNITS.map((unit) => (
                                  <option key={unit.value} value={unit.value}>
                                    {unit.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <Input
                            value={item.description}
                            maxLength={MAX_ITEM_DESCRIPTION}
                            placeholder="Descripción (opcional): caja de 6 panetones"
                            onChange={(event) => updateItem(index, { description: event.target.value })}
                            className="h-12 rounded-xl"
                          />

                          <label className="block text-xs text-muted-foreground">
                            Valor estimado en soles (opcional)
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              value={item.estimatedValue}
                              placeholder="No suma al dinero recaudado"
                              onChange={(event) => updateItem(index, { estimatedValue: event.target.value })}
                              className="mt-1 h-12 rounded-xl"
                            />
                          </label>

                          {(errors[`item-${index}-quantity`] || errors[`item-${index}-product`]) && (
                            <p role="alert" className="text-sm text-destructive">
                              {errors[`item-${index}-quantity`] || errors[`item-${index}-product`]}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground">Resumen: {itemSummary(item)}</p>
                        </div>
                      ))}

                      {items.length < MAX_ITEMS && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 w-full rounded-xl"
                          onClick={() => setItems((current) => [...current, emptyDonationItem()])}
                          data-testid="btn-add-item"
                        >
                          <Plus className="mr-1 h-4 w-4" /> Añadir otro producto
                        </Button>
                      )}
                    </div>
                  )}

                  {/* 1c · Servicios */}
                  {choice === "servicios" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { value: "servicios", label: "Ofrezco un servicio" },
                            { value: "logistica", label: "Apoyo logístico" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setServiceKind(option.value)}
                            aria-pressed={serviceKind === option.value}
                            className={`min-h-[52px] rounded-2xl border-2 px-3 text-sm font-semibold transition-all ${
                              serviceKind === option.value
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border bg-card text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <label htmlFor="donation-service" className="block text-sm font-semibold">
                        ¿En qué consiste tu colaboración?
                      </label>
                      <Textarea
                        id="donation-service"
                        value={message}
                        maxLength={1000}
                        rows={4}
                        placeholder="Ej.: transporte de juguetes, préstamo de vehículo, preparación de la chocolatada, apoyo en la distribución, fotografía, animación infantil…"
                        onChange={(event) => setMessage(event.target.value)}
                        aria-invalid={Boolean(errors.message)}
                        className="rounded-xl"
                        data-testid="donation-service-description"
                      />
                      {errors.message && (
                        <p role="alert" className="text-sm text-destructive">
                          {errors.message}
                        </p>
                      )}
                      <label className="block text-sm text-muted-foreground">
                        Disponibilidad y observaciones (opcional)
                        <Input
                          value={orgName}
                          onChange={(event) => setOrgName(event.target.value)}
                          placeholder="Ej.: sábados por la tarde"
                          className="mt-1 h-12 rounded-xl"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Paso 2: datos del donante ─────────────────────────────── */
                <div className="space-y-4">
                  <label htmlFor="donor-name" className="block text-sm font-semibold">
                    Nombre y apellido *
                  </label>
                  <Input
                    id="donor-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    aria-invalid={Boolean(errors.fullName)}
                    autoComplete="name"
                    className="h-12 rounded-xl"
                    data-testid="input-donor-name"
                  />
                  {errors.fullName && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.fullName}
                    </p>
                  )}

                  <label htmlFor="donor-phone" className="block text-sm font-semibold">
                    WhatsApp *
                  </label>
                  <Input
                    id="donor-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="921 615 737"
                    aria-invalid={Boolean(errors.phone)}
                    autoComplete="tel"
                    className="h-12 rounded-xl"
                    data-testid="input-donor-phone"
                  />
                  {errors.phone && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.phone}
                    </p>
                  )}

                  <label htmlFor="donor-email" className="block text-sm font-semibold">
                    Correo electrónico *
                  </label>
                  <Input
                    id="donor-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                    className="h-12 rounded-xl"
                    data-testid="input-donor-email"
                  />
                  {errors.email && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.email}
                    </p>
                  )}

                  <label htmlFor="donor-org" className="block text-sm font-semibold">
                    Empresa u organización (opcional)
                  </label>
                  <Input
                    id="donor-org"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    className="h-12 rounded-xl"
                  />

                  <div className="space-y-3 pt-1">
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3">
                      <Checkbox
                        checked={contactConsent}
                        onCheckedChange={(value) => setContactConsent(value === true)}
                        className="mt-0.5"
                        data-testid="check-contact-consent"
                      />
                      <span className="text-sm">
                        Autorizo que me contacten para coordinar mi aporte. *
                      </span>
                    </label>
                    {errors.contactConsent && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors.contactConsent}
                      </p>
                    )}

                    <label className="flex items-start gap-3 rounded-xl border border-border p-3">
                      <Checkbox
                        checked={anonymous}
                        onCheckedChange={(value) => setAnonymous(value === true)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        Prefiero que mi nombre no se publique (donación anónima).
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ── Pie (fijo) ───────────────────────────────────────────────── */}
            {!confirmDiscard && (
              <footer className="shrink-0 border-t border-border/60 bg-background px-5 py-4">
                {submitError && (
                  <p
                    role="alert"
                    className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    data-testid="donation-error"
                  >
                    {submitError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestClose}
                    className="h-12 flex-1 rounded-xl sm:flex-none sm:px-6"
                    data-testid="btn-donation-cancel"
                  >
                    Cancelar
                  </Button>
                  {step === 1 ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      className="h-12 flex-1 rounded-xl text-base font-semibold"
                      data-testid="btn-donation-next"
                    >
                      Continuar <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep(1)}
                        disabled={busy}
                        className="h-12 rounded-xl px-3"
                        data-testid="btn-donation-back"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Volver al paso 1</span>
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={busy}
                        className="h-12 flex-1 rounded-xl text-base font-semibold"
                        data-testid="btn-submit-donation"
                      >
                        {busy ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
                          </>
                        ) : (
                          "Confirmar donación"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </footer>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
