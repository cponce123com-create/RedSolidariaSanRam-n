import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, Heart, Baby, PersonStanding, Cat, Home, Zap,
  Camera, Send, CheckCircle, Shield, MapPin, Phone, Mail, User, ArrowLeft
} from "lucide-react";

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const CASE_TYPES = [
  { value: "familia-vulnerable", labelKey: "reportForm.typeFamiliaVulnerable", icon: Heart },
  { value: "nino-necesidad", labelKey: "reportForm.typeNino", icon: Baby },
  { value: "adulto-mayor", labelKey: "reportForm.typeAdultoMayor", icon: PersonStanding },
  { value: "animal-herido", labelKey: "reportForm.typeAnimal", icon: Cat },
  { value: "albergue", labelKey: "reportForm.typeAlbergue", icon: Home },
  { value: "emergencia-comunitaria", labelKey: "reportForm.typeEmergencia", icon: Zap },
];

const URGENCY_LEVELS = [
  { value: "low", labelKey: "reportForm.urgencyLow", color: "text-green-700 bg-green-50 border-green-200" },
  { value: "medium", labelKey: "reportForm.urgencyMedium", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  { value: "high", labelKey: "reportForm.urgencyHigh", color: "text-orange-700 bg-orange-50 border-orange-200" },
  { value: "critical", labelKey: "reportForm.urgencyCritical", color: "text-red-600 bg-red-50 border-red-200" },
];

export default function ReportForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportSchema = z.object({
    type: z.string().min(1, t("reportForm.typeRequired")),
    title: z.string().min(5, t("reportForm.titleMin")),
    description: z.string().min(30, t("reportForm.descriptionMin")),
    location: z.string().min(3, t("reportForm.locationMin")),
    urgency: z.enum(["low", "medium", "high", "critical"]),
    photos: z.string().optional(),
    reporterName: z.string().min(2, t("reportForm.nameRequired")),
    reporterPhone: z.string().optional(),
    reporterEmail: z.string().email(t("reportForm.invalidEmail")).optional().or(z.literal("")),
    isAnonymous: z.boolean().default(false),
  });
  type ReportFormValues = z.infer<typeof reportSchema>;

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      type: "",
      title: "",
      description: "",
      location: "",
      urgency: "medium",
      photos: "",
      reporterName: "",
      reporterPhone: "",
      reporterEmail: "",
      isAnonymous: false,
    },
  });

  const isAnonymous = form.watch("isAnonymous");

  const onSubmit = async (values: ReportFormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        ...values,
        photos: values.photos ? values.photos.split(",").map(s => s.trim()).filter(Boolean) : [],
        reporterEmail: values.reporterEmail || null,
        reporterPhone: values.reporterPhone || null,
      };
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al enviar el reporte");
      setSubmitted(true);
    } catch (err) {
      toast({ title: t("reportForm.toastError"), description: t("reportForm.toastErrorDesc"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">{t("reportForm.successTitle")}</h2>
            <p className="text-muted-foreground text-lg">
              {t("reportForm.successDesc")}
            </p>
          </div>
          <div className="bg-secondary/50 rounded-2xl p-5 text-left text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">{t("reportForm.nextSteps")}</p>
            <p>{t("reportForm.nextStep1")}</p>
            <p>{t("reportForm.nextStep2")}</p>
            <p>{t("reportForm.nextStep3")}</p>
            <p>{t("reportForm.nextStep4")}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/")}>
              {t("reportForm.backHome")}
            </Button>
            <Button className="rounded-xl" onClick={() => { setSubmitted(false); form.reset(); }}>
              {t("reportForm.reportAnother")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      {/* Header */}
      <div className="mb-10">
        <Link href="/casos-urgentes">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> {t("reportForm.viewUrgentCases")}
          </button>
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <AlertTriangle className="w-7 h-7 text-primary" />
          </div>
          <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("urgentCases.reportCase")}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black text-foreground mb-3">{t("reportForm.title")}</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("reportForm.subtitle")}
        </p>
      </div>

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-8 flex gap-3">
        <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">{t("reportForm.privacyTitle")}</span> {t("reportForm.privacyText")}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* SECTION 1: Type of Case */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
              {t("reportForm.section1Title")}
            </h2>

            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-semibold">{t("reportForm.typeQuestion")}</FormLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                  {CASE_TYPES.map(({ value, labelKey, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => field.onChange(value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-sm font-medium transition-all ${
                        field.value === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-center leading-tight">{t(labelKey)}</span>
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="urgency" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-semibold">{t("reportForm.urgencyLabel")}</FormLabel>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {URGENCY_LEVELS.map(({ value, labelKey, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => field.onChange(value)}
                      className={`px-4 py-3 rounded-2xl border-2 text-sm font-semibold text-left transition-all ${
                        field.value === value
                          ? `border-current ${color} ring-2 ring-current ring-offset-1`
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* SECTION 2: Case Details */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
              {t("reportForm.section2Title")}
            </h2>

            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("reportForm.titleLabel")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("reportForm.titlePlaceholder")} className="rounded-xl bg-secondary/30" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("reportForm.descLabel")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("reportForm.descPlaceholder")}
                    className="min-h-[140px] rounded-xl bg-secondary/30 resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {t("reportForm.locationLabel")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("reportForm.locationPlaceholder")} className="rounded-xl bg-secondary/30" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="photos" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2"><Camera className="w-4 h-4 text-primary" /> {t("reportForm.photosLabel")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("reportForm.photosPlaceholder")} className="rounded-xl bg-secondary/30" {...field} />
                </FormControl>
                <p className="text-xs text-muted-foreground">{t("reportForm.photosHint")}</p>
              </FormItem>
            )} />
          </div>

          {/* SECTION 3: Reporter Info */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
              {t("reportForm.section3Title")}
            </h2>

            {/* Anonymous toggle */}
            <div className="flex items-center justify-between bg-secondary/40 rounded-2xl p-4 border border-border">
              <div>
                <p className="font-semibold text-sm">{t("reportForm.anonToggleTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("reportForm.anonToggleDesc")}</p>
              </div>
              <button
                type="button"
                onClick={() => form.setValue("isAnonymous", !isAnonymous)}
                className={`relative w-12 h-6 rounded-full transition-colors ${isAnonymous ? "bg-primary" : "bg-border"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-card rounded-full shadow transition-transform ${isAnonymous ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>

            <FormField control={form.control} name="reporterName" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2"><User className="w-4 h-4 text-primary" /> {t("reportForm.reporterNameLabel")} {isAnonymous && <span className="text-xs text-muted-foreground">{t("reportForm.reporterNameOnlyForUs")}</span>}</FormLabel>
                <FormControl>
                  <Input placeholder={t("reportForm.reporterNamePlaceholder")} className="rounded-xl bg-secondary/30" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="reporterPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> {t("reportForm.reporterPhoneLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder="921 615 737" className="rounded-xl bg-secondary/30" {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="reporterEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> {t("reportForm.reporterEmailLabel")}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="tu@correo.com" className="rounded-xl bg-secondary/30" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-10 h-14 text-base rounded-2xl shadow-lg shadow-primary/20 hover-elevate"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t("reportForm.sending")}</span>
              ) : (
                <span className="flex items-center gap-2"><Send className="w-5 h-5" /> {t("reportForm.submit")}</span>
              )}
            </Button>
            <p className="text-sm text-muted-foreground text-center sm:text-left">
              {t("reportForm.consent")}
            </p>
          </div>
        </form>
      </Form>
    </div>
  );
}
