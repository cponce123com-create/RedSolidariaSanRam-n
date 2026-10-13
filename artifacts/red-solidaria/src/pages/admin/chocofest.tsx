import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCampaigns,
  useGetCampaignImages,
  useCreateCampaign,
  type Campaign,
} from "@workspace/api-client-react";
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
} from "lucide-react";
import { CHOCOFEST_2026, CHOCOFEST_2026_PATH, findChocofest2026 } from "@/lib/chocofest";

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
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
          toast({
            title: t("adminChocofest.createSuccess"),
            description: t("adminChocofest.createSuccessDesc"),
          });
        },
        onError: () => {
          toast({ title: t("adminChocofest.createError"), variant: "destructive" });
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

/** Panel cuando la campaña ya existe: KPIs, accesos y estado de secciones. */
function FoundPanel({ campaign }: { campaign: Campaign }) {
  const { t } = useTranslation();
  const { data: images } = useGetCampaignImages(campaign.id);

  const goal = campaign.goal || 0;
  const raised = campaign.raised || 0;
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const hasDonations = (campaign.donorCount ?? 0) > 0;
  const hasImages = !!images && images.length > 0;
  const hasGoal = goal > 0;

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

      {/* Estado de las secciones */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-3">{t("adminChocofest.readinessTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Readiness label={t("adminChocofest.checkPresentation")} ready={!!campaign.description} />
          <Readiness label={t("adminChocofest.checkGoal")} ready={hasGoal} />
          <Readiness label={t("adminChocofest.checkDonations")} ready={hasDonations} />
          <Readiness label={t("adminChocofest.checkGallery")} ready={hasImages} />
          <Readiness
            label={t("adminChocofest.checkTimeline")}
            ready={false}
            hint={t("adminChocofest.pending")}
          />
          <Readiness label={t("adminChocofest.checkTransparency")} ready={hasDonations} />
        </div>
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
