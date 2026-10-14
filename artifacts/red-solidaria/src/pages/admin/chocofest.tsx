import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCampaigns,
  useGetCampaignImages,
  useGetCampaignUpdates,
  useCreateCampaign,
  type Campaign,
} from "@workspace/api-client-react";
import {
  useAdminCampaignExpenses,
  useAdminCampaignBudgets,
  useAdminCampaignLeftovers,
} from "@/hooks/use-phase3";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Target,
  DollarSign,
  Users,
  Building2,
  Shield,
  ArrowRight,
  ImageIcon,
  Calendar,
  CheckCircle2,
  XCircle,
  Plus,
  ExternalLink,
  Star,
  Save,
} from "lucide-react";
import {
  CHOCOFEST_2026,
  CHOCOFEST_2026_PATH,
  CHOCOFEST_SETTING_KEYS,
  PROTAGONIST_SETTING_KEY,
  findChocofest2026,
  eventReadiness,
  parseProtagonistId,
  resolveEventDetails,
} from "@/lib/chocofest";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { useSaveSettings, useSetProtagonist } from "@/hooks/use-campaign-lifecycle";
import { errorMessage, invalidateCampaignQueries } from "@/lib/campaign-admin";

/** Tarjeta de sección con estado listo/pendiente. */
function Readiness({
  label,
  ready,
  hint,
}: {
  label: string;
  ready: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      {ready ? (
        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {ready ? t("adminChocofest.ready") : t("adminChocofest.pending")}
          {hint ? ` · ${hint}` : ""}
        </p>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <span className="flex items-center gap-3 font-medium text-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <ArrowRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  );
}

/** Panel cuando la campaña 2026 aún no existe: creación guiada. */
function CreatePanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateCampaign();
  const setProtagonist = useSetProtagonist();

  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const canSubmit = goal !== "" && Number(goal) > 0 && startDate !== "" && !createMutation.isPending;

  const handleCreate = () => {
    createMutation.mutate(
      {
        data: {
          title: CHOCOFEST_2026.campaignTitle,
          description:
            "Campaña navideña de chocolatada de Red Solidaria San Ramón. " +
            "(Contenido provisional: edítalo desde el panel de administración.)",
          goal: Number(goal),
          raised: 0,
          status: "active",
          featured: true,
          category: "niñez",
          startDate,
          endDate: endDate || null,
        },
      },
      {
        onSuccess: (created) => {
          invalidateCampaignQueries(queryClient);
          // ChocoFest 2026 pasa a ser la campaña protagonista de la portada:
          // aparece en el primer bloque relevante de la página de inicio.
          if (created?.id) setProtagonist.mutate(created.id);
          toast({
            title: t("adminChocofest.createSuccess"),
            description: t("adminChocofest.createSuccessDesc"),
          });
        },
        onError: (err) => {
          toast({
            title: t("adminChocofest.createError"),
            description: errorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6">
        <h2 className="text-xl font-display font-bold text-amber-900 mb-2">
          {t("adminChocofest.notFoundTitle")}
        </h2>
        <p className="text-sm text-amber-800">{t("adminChocofest.notFoundText")}</p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6">
        <h3 className="text-lg font-bold text-foreground mb-1">{t("adminChocofest.createTitle")}</h3>
        <p className="text-sm text-muted-foreground mb-6">{t("adminChocofest.provisionalNote")}</p>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="cf-goal">{t("adminChocofest.goalLabel")}</Label>
            <Input
              id="cf-goal"
              type="number"
              min={1}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="rounded-xl mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cf-start">{t("adminChocofest.startDateLabel")}</Label>
            <Input
              id="cf-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cf-end">{t("adminChocofest.endDateLabel")}</Label>
            <Input
              id="cf-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl mt-1"
            />
          </div>
        </div>

        <Button
          className="mt-6 rounded-xl gap-2"
          disabled={!canSubmit}
          onClick={handleCreate}
        >
          <Plus className="w-4 h-4" />
          {createMutation.isPending ? t("adminChocofest.creating") : t("adminChocofest.createButton")}
        </Button>
      </div>
    </div>
  );
}

/** Panel cuando la campaña ya existe: KPIs, portada, datos del evento y accesos. */
function FoundPanel({ campaign }: { campaign: Campaign }) {
  const { t } = useTranslation();
  const { data: images } = useGetCampaignImages(campaign.id);
  const { data: updates } = useGetCampaignUpdates(campaign.id);
  // Contadores reales para el estado de organización: antes el punto del
  // «cronograma» estaba fijado en `false` aunque hubiera novedades publicadas.
  const { data: expenses } = useAdminCampaignExpenses(campaign.id);
  const { data: budgets } = useAdminCampaignBudgets(campaign.id);
  const { data: items } = useAdminCampaignLeftovers(campaign.id);
  const { data: settings } = usePublicSettings();
  const setProtagonist = useSetProtagonist();
  const saveSettings = useSaveSettings();

  const protagonistId = parseProtagonistId(settings?.[PROTAGONIST_SETTING_KEY]);
  const isProtagonist = protagonistId === campaign.id;
  const details = resolveEventDetails(settings);

  const [place, setPlace] = useState("");
  const [schedule, setSchedule] = useState("");
  const [motto, setMotto] = useState("");
  const [objectives, setObjectives] = useState("");
  const [organizers, setOrganizers] = useState("");

  // Sincroniza el formulario con lo guardado (una vez cargada la configuración).
  useEffect(() => {
    setPlace(settings?.[CHOCOFEST_SETTING_KEYS.place] ?? "");
    setSchedule(settings?.[CHOCOFEST_SETTING_KEYS.schedule] ?? "");
    setMotto(settings?.[CHOCOFEST_SETTING_KEYS.motto] ?? "");
    setObjectives(settings?.[CHOCOFEST_SETTING_KEYS.objectives] ?? "");
    setOrganizers(settings?.[CHOCOFEST_SETTING_KEYS.organizers] ?? "");
  }, [settings]);

  const goal = campaign.goal || 0;
  const raised = campaign.raised || 0;
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  // Estado de organización: cada punto se deriva de lo que existe de verdad.
  const readiness = eventReadiness({
    campaign,
    isProtagonist,
    donationCount: campaign.donorCount ?? 0,
    imageCount: images?.length ?? 0,
    updateCount: updates?.length ?? 0,
    expenseCount: expenses?.length ?? 0,
    budgetCount: budgets?.length ?? 0,
    itemCount: items?.length ?? 0,
  });

  const saveDetails = () => {
    saveSettings.mutate([
      {
        key: CHOCOFEST_SETTING_KEYS.place,
        value: place,
        label: "Lugar del evento ChocoFest 2026",
        group: "chocofest",
      },
      {
        key: CHOCOFEST_SETTING_KEYS.schedule,
        value: schedule,
        label: "Horario del evento ChocoFest 2026",
        group: "chocofest",
      },
      {
        key: CHOCOFEST_SETTING_KEYS.motto,
        value: motto,
        label: "Lema ChocoFest 2026",
        group: "chocofest",
      },
      {
        key: CHOCOFEST_SETTING_KEYS.objectives,
        value: objectives,
        label: "Objetivos del evento ChocoFest 2026",
        group: "chocofest",
      },
      {
        key: CHOCOFEST_SETTING_KEYS.organizers,
        value: organizers,
        label: "Equipo responsable del evento ChocoFest 2026",
        group: "chocofest",
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Estado */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Badge className="bg-green-600 hover:bg-green-600">{t("adminChocofest.foundTitle")}</Badge>
          <Badge variant="outline">{campaign.title}</Badge>
          {campaign.featured && <Badge variant="outline">⭐</Badge>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-secondary/50 p-4 border border-border/50">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {t("adminChocofest.raisedLabel")}
            </div>
            <div className="text-2xl font-display font-bold text-foreground">
              S/ {raised.toLocaleString("es-PE", { minimumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("adminChocofest.goalLabel")}: S/ {goal.toLocaleString("es-PE")} ({progress}%)
            </div>
          </div>
          <div className="rounded-2xl bg-secondary/50 p-4 border border-border/50">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {t("adminChocofest.donationsLabel")}
            </div>
            <div className="text-2xl font-display font-bold text-foreground">
              {campaign.donorCount ?? 0}
            </div>
          </div>
          <div className="rounded-2xl bg-secondary/50 p-4 border border-border/50">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              {t("adminChocofest.startDateLabel")}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {campaign.startDate ?? "—"}
              {campaign.endDate ? ` → ${campaign.endDate}` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Portada / protagonista */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              {t("adminChocofest.protagonistTitle")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isProtagonist
                ? t("adminChocofest.protagonistActive")
                : t("adminChocofest.protagonistInactive")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("adminChocofest.protagonistNote")}
            </p>
          </div>
          <Button
            variant={isProtagonist ? "outline" : "default"}
            className="rounded-xl"
            disabled={setProtagonist.isPending}
            onClick={() => setProtagonist.mutate(isProtagonist ? null : campaign.id)}
          >
            {isProtagonist
              ? t("adminChocofest.protagonistRemove")
              : t("adminChocofest.protagonistSet")}
          </Button>
        </div>
      </div>

      {/* Datos del evento (lugar, horario, lema) */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <h3 className="text-lg font-bold text-foreground mb-1">
          {t("adminChocofest.eventDetailsTitle")}
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          {t("adminChocofest.eventDetailsNote")}
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="cf-place">{t("adminChocofest.placeLabel")}</Label>
            <Input
              id="cf-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={t("adminChocofest.placePlaceholder")}
              className="rounded-xl mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cf-schedule">{t("adminChocofest.scheduleLabel")}</Label>
            <Input
              id="cf-schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder={t("adminChocofest.schedulePlaceholder")}
              className="rounded-xl mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cf-motto">{t("adminChocofest.mottoLabel")}</Label>
            <Input
              id="cf-motto"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder={t("adminChocofest.mottoPlaceholder")}
              className="rounded-xl mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cf-objectives">{t("adminChocofest.detailsObjectives")}</Label>
            <Input
              id="cf-objectives"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              className="rounded-xl mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("adminChocofest.detailsObjectivesHint")}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cf-organizers">{t("adminChocofest.detailsOrganizers")}</Label>
            <Input
              id="cf-organizers"
              value={organizers}
              onChange={(e) => setOrganizers(e.target.value)}
              className="rounded-xl mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("adminChocofest.detailsOrganizersHint")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            className="rounded-xl gap-2"
            disabled={saveSettings.isPending}
            onClick={saveDetails}
          >
            <Save className="w-4 h-4" />
            {saveSettings.isPending
              ? t("adminChocofest.savingEventDetails")
              : t("adminChocofest.saveEventDetails")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("chocofest.eventPlaceLabel")}: {details.place}
            {details.schedule
              ? ` · ${t("chocofest.eventScheduleLabel")}: ${details.schedule}`
              : ""}
          </span>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-3">{t("adminChocofest.quickLinksTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            href={`/admin/campanas/${campaign.id}`}
            icon={<Target className="w-5 h-5" />}
            label={t("adminChocofest.linkEditCampaign")}
          />
          <QuickLink
            href="/admin/donaciones"
            icon={<DollarSign className="w-5 h-5" />}
            label={t("adminChocofest.linkDonations")}
          />
          <QuickLink
            href="/admin/voluntarios"
            icon={<Users className="w-5 h-5" />}
            label={t("adminChocofest.linkVolunteers")}
          />
          <QuickLink
            href="/admin/aliados"
            icon={<Building2 className="w-5 h-5" />}
            label={t("adminChocofest.linkAllies")}
          />
          <QuickLink
            href={`/campanas/${campaign.id}/transparencia`}
            icon={<Shield className="w-5 h-5" />}
            label={t("adminChocofest.linkTransparency")}
          />
          <QuickLink
            href={CHOCOFEST_2026_PATH}
            icon={<ExternalLink className="w-5 h-5" />}
            label={t("adminChocofest.linkPublicPage")}
          />
        </div>
      </div>

      {/* Estado de las secciones: cada punto se calcula con datos reales, así que
          el semáforo sirve de verdad para saber qué falta (Fase 2.1). */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="text-lg font-bold text-foreground">{t("adminChocofest.readinessTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {readiness.ready
              ? t("adminChocofest.readinessReady")
              : t("adminChocofest.readinessProgress", {
                  done: readiness.done,
                  total: readiness.total,
                  percent: readiness.percent,
                })}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {readiness.checks.map((check) => (
            <Readiness
              key={check.key}
              label={t(
                ({
                  published: "adminChocofest.checkPublished",
                  protagonist: "adminChocofest.checkProtagonist",
                  presentation: "adminChocofest.checkPresentation",
                  goal: "adminChocofest.checkGoal",
                  dates: "adminChocofest.checkDates",
                  cover: "adminChocofest.checkCover",
                  donations: "adminChocofest.checkDonations",
                  gallery: "adminChocofest.checkGallery",
                  timeline: "adminChocofest.checkTimeline",
                  transparency: "adminChocofest.checkTransparency",
                  budget: "adminChocofest.checkBudget",
                  inventory: "adminChocofest.checkInventory",
                } as Record<string, string>)[check.key] ?? "adminChocofest.pending",
              )}
              ready={check.ok}
              hint={check.ok ? undefined : t("adminChocofest.pending")}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">{t("adminChocofest.readinessNote")}</p>
      </div>
    </div>
  );
}

export default function AdminChocofest() {
  const { t } = useTranslation();
  const { data: campaigns, isLoading, isError } = useGetCampaigns();
  const campaign = findChocofest2026(campaigns);

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-display font-bold text-foreground">{t("adminChocofest.title")}</h1>
        <p className="text-muted-foreground">{t("adminChocofest.subtitle")}</p>
      </header>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : isError ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">
          {t("adminChocofest.createError")}
        </div>
      ) : campaign ? (
        <FoundPanel campaign={campaign} />
      ) : (
        <CreatePanel />
      )}

      <p className="text-xs text-muted-foreground mt-6 flex items-center gap-2">
        <ImageIcon className="w-4 h-4" />
        {t("adminChocofest.subtitle")}
        <Calendar className="w-4 h-4 ml-2" />
        {CHOCOFEST_2026.location}
      </p>
    </div>
  );
}
