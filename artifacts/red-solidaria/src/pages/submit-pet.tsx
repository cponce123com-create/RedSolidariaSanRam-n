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
import { useToast } from "@/hooks/use-toast";
import { Dog, Cat, Heart, CheckCircle, ArrowLeft, Camera, Shield, Info } from "lucide-react";

const BOOL_TOGGLE = (label: string, sub: string, key: string, form: any) => (
  <div className="flex items-center justify-between bg-secondary/40 rounded-xl p-3 border border-border">
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={form.watch(key)}
      onClick={() => form.setValue(key, !form.watch(key))}
      className={`relative w-12 h-7 rounded-full transition-colors ${form.watch(key) ? "bg-primary" : "bg-border"}`}
    >
      <span className={`absolute top-1 w-5 h-5 bg-card rounded-full shadow transition-transform ${form.watch(key) ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  </div>
);

export default function SubmitPet() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const schema = z.object({
    name: z.string().min(1, t("submitPet.nameRequired")),
    species: z.enum(["perro", "gato"]),
    breed: z.string().optional(),
    sex: z.enum(["macho", "hembra"]),
    ageCategory: z.enum(["puppy", "adult", "senior"]),
    ageApprox: z.string().optional(),
    size: z.enum(["small", "medium", "large", "giant"]),
    photos: z.string().optional(),
    description: z.string().min(30, t("submitPet.descriptionMin")),
    history: z.string().optional(),
    vaccinated: z.boolean().default(false),
    sterilized: z.boolean().default(false),
    dewormed: z.boolean().default(false),
    location: z.string().min(3, t("submitPet.locationRequired")),
    contactName: z.string().min(2, t("submitPet.contactNameRequired")),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email(t("donation.invalidEmail")).optional().or(z.literal("")),
    urgent: z.boolean().default(false),
    adoptionRequirements: z.string().optional(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      species: "perro", sex: "macho", ageCategory: "adult", size: "medium",
      vaccinated: false, sterilized: false, dewormed: false, urgent: false,
      name: "", breed: "", ageApprox: "", photos: "", description: "", history: "",
      location: "", contactName: "", contactPhone: "", contactEmail: "", adoptionRequirements: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        ...values,
        photos: values.photos ? values.photos.split(",").map(s => s.trim()).filter(Boolean) : [],
        submittedByPublic: true,
      };
      const res = await fetch("/api/pets/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al enviar");
      setSubmitted(true);
    } catch {
      toast({ title: t("submitPet.toastError"), description: t("submitPet.toastErrorDesc"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-amber-600" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold mb-2">{t("submitPet.successTitle")}</h2>
            <p className="text-muted-foreground text-lg">{t("submitPet.successDescription")}</p>
          </div>
          <div className="bg-secondary/50 rounded-2xl p-5 text-left text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">{t("submitPet.nextSteps")}</p>
            <p>{t("submitPet.nextStep1")}</p>
            <p>{t("submitPet.nextStep2")}</p>
            <p>{t("submitPet.nextStep3")}</p>
            <p>{t("submitPet.nextStep4")}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/adopciones">
              <Button variant="outline" className="rounded-xl">{t("submitPet.viewAdoptions")}</Button>
            </Link>
            <Button className="rounded-xl bg-amber-500 hover:bg-amber-600" onClick={() => { setSubmitted(false); form.reset(); }}>
              {t("submitPet.publishAnother")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 sm:pt-28 pb-10 sm:pb-16">
      <Link href="/adopciones">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("submitPet.backToCatalog")}
        </button>
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 rounded-2xl"><Heart className="w-7 h-7 text-amber-600" /></div>
          <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("submitPet.badge")}</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-black mb-3">{t("submitPet.title")}</h1>
        <p className="text-muted-foreground text-lg">{t("submitPet.subtitle")}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-8 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          <strong>{t("submitPet.responsibleAdoption")}</strong> {t("submitPet.responsibleAdoptionText")}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* SECCIÓN 1: Info básica */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
              {t("submitPet.section1Title")}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Species */}
              <FormField control={form.control} name="species" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>{t("submitPet.fieldSpecies")}</FormLabel>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {[{ value: "perro", labelKey: "submitPet.speciesDog", icon: Dog }, { value: "gato", labelKey: "submitPet.speciesCat", icon: Cat }].map(s => (
                      <button key={s.value} type="button" onClick={() => field.onChange(s.value)}
                        className={`flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${field.value === s.value ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        <s.icon className="w-5 h-5" />{t(s.labelKey)}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldName")}</FormLabel>
                  <FormControl><Input placeholder={t("submitPet.fieldNamePlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="breed" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldBreed")}</FormLabel>
                  <FormControl><Input placeholder={t("submitPet.fieldBreedPlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sex */}
              <FormField control={form.control} name="sex" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldSex")}</FormLabel>
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {[{ v: "macho", lk: "submitPet.sexMale" }, { v: "hembra", lk: "submitPet.sexFemale" }].map(s => (
                      <button key={s.v} type="button" onClick={() => field.onChange(s.v)}
                        className={`py-2 rounded-xl text-sm border-2 font-medium ${field.value === s.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        {t(s.lk)}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
              {/* Age */}
              <FormField control={form.control} name="ageCategory" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldAgeStage")}</FormLabel>
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {[{ v: "puppy", lk: "submitPet.agePuppy" }, { v: "adult", lk: "submitPet.ageAdult" }, { v: "senior", lk: "submitPet.ageSenior" }].map(a => (
                      <button key={a.v} type="button" onClick={() => field.onChange(a.v)}
                        className={`py-2 rounded-xl text-sm border-2 font-medium ${field.value === a.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        {t(a.lk)}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
              {/* Size */}
              <FormField control={form.control} name="size" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldSize")}</FormLabel>
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {[{ v: "small", lk: "submitPet.sizeSmall" }, { v: "medium", lk: "submitPet.sizeMedium" }, { v: "large", lk: "submitPet.sizeLarge" }].map(s => (
                      <button key={s.v} type="button" onClick={() => field.onChange(s.v)}
                        className={`py-2 rounded-xl text-sm border-2 font-medium ${field.value === s.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground"}`}>
                        {t(s.lk)}
                      </button>
                    ))}
                  </div>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="ageApprox" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("submitPet.fieldApproxAge")}</FormLabel>
                <FormControl><Input placeholder={t("submitPet.fieldApproxAgePlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
              </FormItem>
            )} />
          </div>

          {/* SECCIÓN 2: Historia y descripción */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
              {t("submitPet.section2Title")}
            </h2>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("submitPet.fieldDescription")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("submitPet.fieldDescriptionPlaceholder")} className="min-h-[110px] rounded-xl bg-secondary/30 resize-none" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="history" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("submitPet.fieldHistory")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("submitPet.fieldHistoryPlaceholder")} className="min-h-[80px] rounded-xl bg-secondary/30 resize-none" {...field} />
                </FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="photos" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2"><Camera className="w-4 h-4 text-amber-600" /> {t("submitPet.fieldPhotos")}</FormLabel>
                <FormControl><Input placeholder={t("submitPet.fieldPhotosPlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                <p className="text-xs text-muted-foreground">{t("submitPet.fieldPhotosHint")}</p>
              </FormItem>
            )} />
          </div>

          {/* SECCIÓN 3: Salud */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
              {t("submitPet.section3Title")}
            </h2>
            {BOOL_TOGGLE(t("submitPet.toggleVaccinated"), t("submitPet.toggleVaccinatedSub"), "vaccinated", form)}
            {BOOL_TOGGLE(t("submitPet.toggleSterilized"), t("submitPet.toggleSterilizedSub"), "sterilized", form)}
            {BOOL_TOGGLE(t("submitPet.toggleDewormed"), t("submitPet.toggleDewormedSub"), "dewormed", form)}
            {BOOL_TOGGLE(t("submitPet.toggleUrgent"), t("submitPet.toggleUrgentSub"), "urgent", form)}
            <FormField control={form.control} name="adoptionRequirements" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("submitPet.fieldRequirements")}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t("submitPet.fieldRequirementsPlaceholder")} className="min-h-[80px] rounded-xl bg-secondary/30 resize-none" {...field} />
                </FormControl>
              </FormItem>
            )} />
          </div>

          {/* SECCIÓN 4: Contacto */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <span className="w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold">4</span>
              {t("submitPet.section4Title")}
            </h2>
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("submitPet.fieldLocation")}</FormLabel>
                <FormControl><Input placeholder={t("submitPet.fieldLocationPlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="contactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldContactName")}</FormLabel>
                  <FormControl><Input placeholder={t("submitPet.fieldContactNamePlaceholder")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldContactPhone")}</FormLabel>
                  <FormControl><Input placeholder="921 615 737" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("submitPet.fieldContactEmail")}</FormLabel>
                  <FormControl><Input type="email" placeholder="tu@email.com" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-10 h-14 text-base rounded-2xl bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20 hover-elevate">
            {isSubmitting ? (
              <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t("contact.sending")}</span>
            ) : (
              <span className="flex items-center gap-2"><Heart className="w-5 h-5" /> {t("submitPet.submitButton")}</span>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
