import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/shared/ImageUploadField";
import {
  Heart, CheckCircle, ArrowLeft, Users, Clock, Star,
  MapPin, Phone, Mail, Briefcase, HandHeart
} from "lucide-react";

// Los valores de texto son claves i18n: los etiquetados se traducen con t() en el render.
const AVAILABILITY_OPTIONS = [
  { value: "fines-semana", labelKey: "volunteer.availabilityWeekends" },
  { value: "entre-semana", labelKey: "volunteer.availabilityWeekdays" },
  { value: "ambos", labelKey: "volunteer.availabilityBoth" },
  { value: "eventos", labelKey: "volunteer.availabilityEvents" },
  { value: "remoto", labelKey: "volunteer.availabilityRemote" },
];

// Los valores se envían a la API tal cual (español); solo la etiqueta visible se traduce.
const INTEREST_OPTIONS = [
  { value: "Campañas sociales", labelKey: "volunteer.interestSocialCampaigns" },
  { value: "Bienestar animal", labelKey: "volunteer.interestAnimalWelfare" },
  { value: "Atención a adultos mayores", labelKey: "volunteer.interestSeniors" },
  { value: "Apoyo a niños", labelKey: "volunteer.interestKids" },
  { value: "Colectas y eventos", labelKey: "volunteer.interestCollections" },
  { value: "Redes sociales / difusión", labelKey: "volunteer.interestSocialMedia" },
  { value: "Fotografía / video", labelKey: "volunteer.interestPhotoVideo" },
  { value: "Diseño gráfico", labelKey: "volunteer.interestDesign" },
  { value: "Ayuda legal", labelKey: "volunteer.interestLegal" },
  { value: "Salud / primeros auxilios", labelKey: "volunteer.interestHealth" },
];

const IMPACT_STATS = [
  { value: "120+", labelKey: "volunteer.statVolunteers" },
  { value: "15", labelKey: "volunteer.statBrigades" },
  { value: "2,400+", labelKey: "volunteer.statFamilies" },
  { value: "5", labelKey: "volunteer.statYears" },
];

export default function Volunteer() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const { toast } = useToast();

  const schema = z.object({
    name: z.string().min(2, t("volunteer.nameRequired")),
    email: z.string().email(t("volunteer.invalidEmail")),
    phone: z.string().optional(),
    age: z.string().optional(),
    district: z.string().optional(),
    availability: z.string().min(1, t("volunteer.availabilityRequired")),
    skills: z.string().optional(),
    interests: z.string().optional(),
    motivation: z.string().min(20, t("volunteer.motivationMin")),
    priorExperience: z.string().optional(),
    photo: z.string().optional(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", email: "", phone: "", age: "", district: "",
      availability: "", skills: "", interests: "", motivation: "", priorExperience: "", photo: "",
    },
  });

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const body = { ...values, interests: selectedInterests.join(", ") || values.interests };
      const res = await fetch("/api/volunteers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al enviar");
      setSubmitted(true);
    } catch {
      toast({ title: t("volunteer.toastError"), description: t("volunteer.toastErrorDesc"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold mb-3">{t("volunteer.successTitle")}</h2>
            <p className="text-muted-foreground text-lg">{t("volunteer.successDesc")}</p>
          </div>
          <div className="bg-secondary/50 rounded-2xl p-5 text-left text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">{t("volunteer.nextSteps")}</p>
            <p>{t("volunteer.nextStep1")}</p>
            <p>{t("volunteer.nextStep2")}</p>
            <p>{t("volunteer.nextStep3")}</p>
            <p>{t("volunteer.nextStep4")}</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/como-ayudar">
              <Button variant="outline" className="rounded-xl">{t("volunteer.otherWays")}</Button>
            </Link>
            <Link href="/campanas">
              <Button className="rounded-xl">{t("volunteer.viewCampaigns")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
      <Link href="/como-ayudar">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("volunteer.backLink")}
        </button>
      </Link>

      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-14">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl"><HandHeart className="w-7 h-7 text-primary" /></div>
            <span className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">{t("volunteer.badge")}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-black mb-4">{t("volunteer.title")}</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t("volunteer.subtitle")}
          </p>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 content-start">
          {IMPACT_STATS.map((stat, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 text-center shadow-sm">
              <p className="text-3xl font-display font-black text-primary mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Benefits strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <h2 className="sr-only">{t("volunteer.benefitsSrOnly")}</h2>
        {[
          { icon: Clock, titleKey: "volunteer.benefitFlexible", descKey: "volunteer.benefitFlexibleDesc" },
          { icon: Users, titleKey: "volunteer.benefitCommunity", descKey: "volunteer.benefitCommunityDesc" },
          { icon: Star, titleKey: "volunteer.benefitImpact", descKey: "volunteer.benefitImpactDesc" },
        ].map((b, i) => (
          <div key={i} className="flex gap-4 items-start bg-secondary/30 rounded-2xl p-5">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0"><b.icon className="w-5 h-5 text-primary" /></div>
            <div>
              <h3 className="font-bold mb-0.5">{t(b.titleKey)}</h3>
              <p className="text-sm text-muted-foreground">{t(b.descKey)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-primary/80 p-8 text-white">
          <h2 className="text-2xl font-display font-bold mb-1">{t("volunteer.formTitle")}</h2>
          <p className="text-white/80">{t("volunteer.formSubtitle")}</p>
        </div>
        <div className="p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Datos personales */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  {t("volunteer.sectionPersonal")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelFullName")}</FormLabel>
                      <FormControl><Input placeholder={t("volunteer.placeholderName")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelAge")}</FormLabel>
                      <FormControl><Input placeholder={t("volunteer.placeholderAge")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelEmail")}</FormLabel>
                      <FormControl><Input type="email" placeholder="tu@email.com" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelPhone")}</FormLabel>
                      <FormControl><Input placeholder="921 615 737" className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="district" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t("volunteer.labelDistrict")}</FormLabel>
                      <FormControl><Input placeholder={t("volunteer.placeholderDistrict")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </section>

              {/* Disponibilidad */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  {t("volunteer.sectionAvailability")}
                </h3>
                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("volunteer.availabilityQuestion")}</FormLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {AVAILABILITY_OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => field.onChange(opt.value)}
                          className={`px-4 py-3 rounded-xl text-sm text-left border-2 font-medium transition-all ${field.value === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"}`}>
                          {t(opt.labelKey)}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </section>

              {/* Habilidades e intereses */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  {t("volunteer.sectionSkills")}
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">{t("volunteer.interestsQuestion")}</p>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => toggleInterest(opt.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedInterests.includes(opt.value) ? "bg-primary text-white border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 bg-secondary/30"}`}>
                          {t(opt.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FormField control={form.control} name="skills" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelSkills")}</FormLabel>
                      <FormControl><Input placeholder={t("volunteer.placeholderSkills")} className="rounded-xl bg-secondary/30" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priorExperience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("volunteer.labelExperience")}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t("volunteer.placeholderExperience")} className="min-h-[80px] rounded-xl bg-secondary/30 resize-none" {...field} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              </section>

              {/* Motivación */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  {t("volunteer.sectionMotivation")}
                </h3>
                <FormField control={form.control} name="motivation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("volunteer.motivationQuestion")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("volunteer.placeholderMotivation")} className="min-h-[110px] rounded-xl bg-secondary/30 resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </section>

              {/* Tu foto */}
              <section>
                <h3 className="font-bold text-base mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                  <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                  {t("volunteer.sectionPhoto")}
                </h3>
                <FormField control={form.control} name="photo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("volunteer.labelPhoto")}</FormLabel>
                    <FormControl>
                      <ImageUploadField value={field.value} onChange={field.onChange} endpoint="/api/uploads/signature" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t("volunteer.photoHint")}</p>
                  </FormItem>
                )} />
              </section>

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-12 h-14 text-base rounded-2xl shadow-lg shadow-primary/20 hover-elevate">
                {isSubmitting ? (
                  <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t("volunteer.sending")}</span>
                ) : (
                  <span className="flex items-center gap-2"><Heart className="w-5 h-5" /> {t("volunteer.submit")}</span>
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
