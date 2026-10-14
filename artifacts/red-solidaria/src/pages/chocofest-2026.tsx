import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetCampaigns,
  useGetCampaignUpdates,
  useGetCampaignImages,
  useGetCampaignDonors,
  type Campaign,
} from "@workspace/api-client-react";
import { useCampaignTransparency, usePublicCampaignBudgets } from "@/hooks/use-phase3";
import { buildBudget, campaignBalance } from "@/lib/budget";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Heart,
  Users,
  Calendar,
  Target,
  Gift,
  HandHeart,
  Store,
  MapPin,
  ImageIcon,
  Shield,
  ArrowRight,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { formatSafeDate, getDateFormatLocale } from "@/lib/i18n/date";
import { optimizeImageUrl } from "@/lib/image-url";
import SEO from "@/components/shared/SEO";
import ShareButtons from "@/components/shared/ShareButtons";
import { DonationModal } from "@/components/shared/DonationModal";
import {
  CHOCOFEST_2026,
  CHOCOFEST_2026_PATH,
  CHOCOFEST_PROGRAM_SETTING_KEY,
  findChocofest2026,
  parseProgram,
  resolveEventDetails,
} from "@/lib/chocofest";
import { RESULTS_SETTING_KEYS, assembleEventResults } from "@/lib/event-results";
import { usePublicSettings } from "@/hooks/use-public-settings";
import {
  formatItemAmount,
  formatQuantity,
  goalProgress,
  groupInventoryByCategory,
  normalizeCategory,
  resolveStock,
  summarizeInventory,
} from "@/lib/inventory";
import { basketCoverage, parseComposition } from "@/lib/baskets";
import { isVideoEvidence, summarizeEvidence } from "@/lib/results";
import { AlliesStrip } from "@/components/allies/AlliesStrip";

/** Encabezado de sección homogéneo para toda la página. */
function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-2xl font-display font-bold mb-4 border-b border-border pb-2 flex items-center gap-2 text-foreground">
        <span className="text-primary">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="bg-secondary/30 rounded-2xl p-6 text-center border border-dashed border-border text-muted-foreground text-sm">
      {text}
    </div>
  );
}

/** Aviso de contenido provisional (no son datos oficiales). */
function ProvisionalNotice() {
  const { t } = useTranslation();
  return (
    <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="text-sm">
        <p className="font-bold">{t("chocofest.provisionalBadge")}</p>
        <p className="text-amber-800">{t("chocofest.provisionalNotice")}</p>
      </div>
    </div>
  );
}

/** Página mostrada cuando la campaña 2026 aún no existe en la BD. */
function Preparing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen pt-24 pb-20 bg-background">
      <SEO
        title={t("chocofest.metaTitle")}
        description={t("chocofest.metaDescription")}
        url={CHOCOFEST_2026_PATH}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-4 border-amber-300 bg-amber-50 text-amber-800">
            {t("chocofest.provisionalBadge")}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-3">
            {CHOCOFEST_2026.campaignTitle}
          </h1>
          <p className="text-lg text-muted-foreground">{CHOCOFEST_2026.provisionalMotto}</p>
          <p className="text-sm text-muted-foreground mt-2">
            {CHOCOFEST_2026.organizer} · {CHOCOFEST_2026.location}
          </p>
        </div>
        <div className="bg-card border border-border rounded-3xl p-8 shadow-sm text-center">
          <h2 className="text-xl font-display font-bold mb-2 text-foreground">
            {t("chocofest.preparingTitle")}
          </h2>
          <p className="text-muted-foreground mb-6">{t("chocofest.preparingText")}</p>
          <Link href="/campanas">
            <Button variant="outline" className="rounded-2xl">
              {t("chocofest.backToCampaigns")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Chocofest2026() {
  const { t } = useTranslation();
  const { data: campaigns, isLoading, isError } = useGetCampaigns();
  const campaign = findChocofest2026(campaigns);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-32 text-center text-muted-foreground flex flex-col items-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4" />
        {t("common.loading")}
      </div>
    );
  }

  if (isError || !campaign) {
    return <Preparing />;
  }

  return <ChocofestContent campaign={campaign} />;
}

function ChocofestContent({ campaign }: { campaign: Campaign }) {
  const { t } = useTranslation();
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: updates, isLoading: loadingUpdates } = useGetCampaignUpdates(campaign.id);
  const { data: images, isLoading: loadingImages } = useGetCampaignImages(campaign.id);
  const { data: donors, isLoading: loadingDonors } = useGetCampaignDonors(campaign.id);
  const { data: transparency } = useCampaignTransparency(campaign.id);
  // Lugar, horario y lema son editables desde el panel (settings); si no se han
  // configurado se usan los textos de trabajo marcados como provisionales.
  const { data: settings } = usePublicSettings();
  const details = resolveEventDetails(settings);
  // Programa de actividades con responsables: texto editable desde el panel,
  // interpretado por el parser puro (tolerante a líneas incompletas).
  const program = parseProgram(settings?.[CHOCOFEST_PROGRAM_SETTING_KEY]);
  // Inventario y bienes (chocolatada, juguetes, canastas de víveres): reutiliza
  // los "sobrantes" públicos de la campaña, ya incluidos en la transparencia.
  const inventory = transparency?.publicLeftovers ?? [];
  const inventorySummary = summarizeInventory(inventory);
  // Agrupación por producto para poder mostrar metas y saldos por bloque
  // (chocolatada, regalos, canastas) sin inventar cifras.
  const inventoryGroups = groupInventoryByCategory(inventory);
  // Cobertura de canastas (Fase 2.4): la composición que definió la organización
  // cruzada con el stock real → cuántas canastas COMPLETAS se pueden armar hoy y
  // qué insumo lo impide. Si falta un insumo, la cifra es 0: no se prometen
  // canastas que no se pueden llenar.
  const canastaComposition = parseComposition(
    inventory.find((item) => normalizeCategory(item.category) === "canastas")?.composition,
  );
  const basketReady = basketCoverage(canastaComposition, inventory);
  // Presupuesto por categoría (Fase 2.5): previsión administrada frente a los
  // gastos PUBLICADOS — el sitio público nunca muestra gastos privados — y saldo
  // general con el mismo monto recaudado que muestra la sección de avance.
  const { data: budgetLines } = usePublicCampaignBudgets(campaign.id);
  // Rendición de resultados del evento (Fase 4.3): reúne el dinero de la
  // transparencia, los bienes con su flujo recibido/entregado, las actividades y
  // los datos que solo la organización puede declarar. Nada se inventa: lo no
  // declarado se muestra como «aún no declarado», nunca como un cero.
  const eventResults = assembleEventResults({
    transparency,
    inventory,
    plannedActivities: program,
    results: settings,
  });
  const budgetOverview = buildBudget(budgetLines, transparency?.publicExpenses ?? []);
  const balance = campaignBalance(
    campaign.raised ?? 0,
    budgetOverview.totals.spent,
    campaign.goal,
  );
  // Resultados y rendición final: reutiliza las evidencias públicas.
  const publicEvidence = transparency?.publicEvidence ?? [];
  const resultsSummary = summarizeEvidence(publicEvidence);

  const goal = campaign.goal || 0;
  const raised = campaign.raised || 0;
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <div className="min-h-screen pt-20 pb-20 bg-background">
      <SEO
        title={`${campaign.title} — ${CHOCOFEST_2026.organizer}`}
        description={campaign.description || t("chocofest.metaDescription")}
        url={CHOCOFEST_2026_PATH}
        type="article"
        image={campaign.imageUrl || undefined}
      />

      <DonationModal
        open={isDonationOpen}
        onClose={() => setIsDonationOpen(false)}
        campaignId={campaign.id}
        campaignTitle={campaign.title}
      />

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0 overflow-hidden">
          {selectedImage && (
            <img
              src={optimizeImageUrl(selectedImage, { width: 1400 })}
              alt={t("chocofest.sectionGallery")}
              className="w-full max-h-[80vh] object-contain rounded-2xl"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 1. Portada visual */}
      <div className="w-full h-[38vh] md:h-[50vh] relative">
        <img
          src={
            optimizeImageUrl(campaign.imageUrl, { width: 1600 }) ||
            "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=1600&q=80"
          }
          alt={campaign.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-black/30" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-28 relative z-10">
        <div className="bg-card rounded-3xl shadow-xl border border-border p-6 md:p-10">
          {/* Cabecera */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-3 mb-4">
              <Badge className="px-4 py-1 text-sm bg-primary hover:bg-primary/90">
                {CHOCOFEST_2026.year}
              </Badge>
              <Badge variant="outline" className="px-4 py-1 text-sm text-amber-800 border-amber-300 bg-amber-50">
                {t("chocofest.provisionalBadge")}
              </Badge>
            </div>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight mb-3">
              {campaign.title}
            </h1>
            <p className="text-lg text-muted-foreground italic mb-2">
              {t("chocofest.provisionalMottoLabel")}: {details.motto}
            </p>
            <p className="text-sm text-muted-foreground">
              {details.organizers} · {details.place}
            </p>
          </div>

          <ProvisionalNotice />

          {/* CTA principal */}
          <div className="flex flex-wrap gap-3 mb-10">
            <Button
              className="rounded-2xl h-12 px-6 font-bold shadow-lg shadow-primary/20"
              onClick={() => setIsDonationOpen(true)}
            >
              <Heart className="w-5 h-5 mr-2 fill-current" /> {t("chocofest.ctaDonate")}
            </Button>
            <Link href="/voluntariado">
              <Button variant="outline" className="rounded-2xl h-12 px-6">
                <HandHeart className="w-5 h-5 mr-2" /> {t("chocofest.ctaVolunteer")}
              </Button>
            </Link>
            <Link href="/aliados">
              <Button variant="outline" className="rounded-2xl h-12 px-6">
                <Store className="w-5 h-5 mr-2" /> {t("chocofest.ctaAllies")}
              </Button>
            </Link>
          </div>

          <div className="space-y-12">
            {/* 2. Presentación */}
            <Section id="presentacion" icon={<ClipboardList className="w-5 h-5" />} title={t("chocofest.sectionPresentation")}>
              {campaign.description ? (
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{campaign.description}</p>
              ) : (
                <EmptyBox text={t("chocofest.preparingText")} />
              )}
            </Section>

            {/* 3. Objetivo y metas */}
            <Section id="objetivo" icon={<Target className="w-5 h-5" />} title={t("chocofest.sectionGoal")}>
              {/* Objetivos editables desde el panel. Si la organización aún no los
                  ha definido no se muestra nada: nunca se inventa texto. */}
              {details.objectives ? (
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed mb-5">
                  {details.objectives}
                </p>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-secondary/50 rounded-2xl p-5 border border-border/50">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                    {t("chocofest.goalLabel")}
                  </div>
                  <div className="text-2xl font-display font-bold text-foreground">
                    {goal > 0 ? `S/ ${goal.toLocaleString("es-PE")}` : "—"}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-2xl p-5 border border-border/50">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                    {t("chocofest.eventPlaceLabel")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">{details.place}</div>
                </div>
                <div className="bg-secondary/50 rounded-2xl p-5 border border-border/50">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                    {t("chocofest.eventScheduleLabel")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {details.schedule || "—"}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-2xl p-5 border border-border/50">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                    {t("chocofest.eventDateLabel")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {campaign.startDate
                      ? formatSafeDate(campaign.startDate, t("campaignDetail.dateFormat"), {
                          locale: getDateFormatLocale(),
                        })
                      : "—"}
                  </div>
                </div>
              </div>
            </Section>

            {/* 4. Avance de recaudación */}
            <Section id="avance" icon={<Target className="w-5 h-5" />} title={t("chocofest.sectionProgress")}>
              <div className="flex justify-between items-end mb-2">
                <span className="text-3xl font-display font-extrabold text-foreground">
                  S/ {raised.toLocaleString("es-PE", { minimumFractionDigits: 0 })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("chocofest.goalLabel")}: S/ {goal.toLocaleString("es-PE")}
                </span>
              </div>
              <Progress value={progress} className="h-4 mb-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span className="font-bold text-primary">{t("chocofest.progressLabel", { progress })}</span>
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {t("chocofest.donorsCount", { count: campaign.donorCount ?? 0 })}
                </span>
              </div>
            </Section>

            {/* 5. Donaciones monetarias */}
            <Section id="donaciones" icon={<Heart className="w-5 h-5" />} title={t("chocofest.sectionMoney")}>
              {loadingDonors ? (
                <div className="h-20 flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>
              ) : donors && donors.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {donors.map((donor) => (
                    <div key={donor.id} className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {donor.name || t("campaignDetail.anonymous")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSafeDate(donor.date, t("campaignDetail.dateDayFormat"), {
                            locale: getDateFormatLocale(),
                          })}
                        </p>
                      </div>
                      <span className="font-bold text-primary whitespace-nowrap">
                        S/ {Number(donor.amount ?? 0).toLocaleString("es-PE")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBox text={t("chocofest.emptyMoney")} />
              )}
            </Section>

            {/* 6. Inventario y donaciones en especie */}
            <Section id="especie" icon={<Gift className="w-5 h-5" />} title={t("chocofest.sectionInventory")}>
              {inventory.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.inventoryLinesLabel")}
                      </div>
                      <div className="font-bold text-foreground">{inventorySummary.lines}</div>
                    </div>
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.inventoryUnitsLabel")}
                      </div>
                      <div className="font-bold text-foreground">
                        {formatQuantity(inventorySummary.totalQuantity)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {inventoryGroups.map((group) => (
                      <div key={group.category}>
                        {/* Etiqueta del catálogo compartido (misma fuente que el panel). */}
                        <h3 className="font-display font-bold text-foreground mb-3">{group.label}</h3>
                        <ul className="grid gap-3 sm:grid-cols-2">
                          {group.items.map((item) => {
                            const stock = resolveStock(item);
                            const progress = goalProgress(item.targetQty, stock.received);
                            return (
                              <li key={item.id} className="bg-card border border-border rounded-2xl p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="font-semibold text-foreground">{item.item}</p>
                                  <span className="font-bold text-primary whitespace-nowrap">
                                    {formatItemAmount({ quantity: stock.remaining, unit: item.unit })}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                                  <span>{t("chocofest.itemReceived")}: {formatQuantity(stock.received)}</span>
                                  <span>{t("chocofest.itemUsed")}: {formatQuantity(stock.used)}</span>
                                  <span className="font-semibold text-foreground">
                                    {t("chocofest.itemRemaining")}: {formatQuantity(stock.remaining)}
                                  </span>
                                </div>
                                {progress.hasTarget ? (
                                  <div className="mt-3">
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                      <span>{t("chocofest.itemGoal")}: {formatQuantity(progress.target)}</span>
                                      <span className="font-bold text-primary">
                                        {t("chocofest.progressLabel", { progress: progress.percent })}
                                      </span>
                                    </div>
                                    <Progress value={progress.percent} className="h-2" />
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {t("chocofest.itemNoGoal")}
                                  </p>
                                )}
                                {item.notes ? (
                                  <p className="text-xs text-muted-foreground mt-2">{item.notes}</p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {/* Cobertura de canastas: cifra honesta calculada con el stock real. */}
                  {basketReady.hasComposition ? (
                    <div className="bg-secondary/50 rounded-2xl p-5 border border-border/50 mt-6">
                      <h4 className="font-display font-bold text-foreground mb-2">
                        {t("chocofest.basketReady")}: {formatQuantity(basketReady.baskets)}
                      </h4>
                      {basketReady.limitedBy ? (
                        <p className="text-sm text-muted-foreground mb-3">
                          {t("chocofest.basketLimitedBy")}: {basketReady.limitedBy}
                        </p>
                      ) : null}
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {basketReady.ingredients.map((ingredient) => (
                          <li
                            key={ingredient.name}
                            className="bg-card border border-border rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-3"
                          >
                            <span className="text-foreground">
                              {ingredient.name}{" "}
                              <span className="text-muted-foreground">
                                ({formatQuantity(ingredient.perBasket)}
                                {ingredient.unit ? ` ${ingredient.unit}` : ""})
                              </span>
                            </span>
                            <span
                              className={
                                ingredient.inStock ? "text-muted-foreground" : "text-destructive"
                              }
                            >
                              {ingredient.inStock
                                ? `${formatQuantity(ingredient.available)} → ${formatQuantity(ingredient.basketsFromIt)}`
                                : t("chocofest.basketNoStock")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyBox text={t("chocofest.emptyInventory")} />
              )}
              <p className="text-xs text-muted-foreground mt-3">{t("chocofest.inventoryNote")}</p>
            </Section>

            {/* 6b. Presupuesto por categoría y saldo general (Fase 2.5) */}
            <Section id="presupuesto" icon={<ClipboardList className="w-5 h-5" />} title={t("chocofest.sectionBudget")}>
              {budgetOverview.rows.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-6">
                    {[
                      { label: t("chocofest.budgetPlanned"), value: budgetOverview.totals.planned },
                      { label: t("chocofest.budgetSpent"), value: budgetOverview.totals.spent },
                      { label: t("chocofest.budgetRemaining"), value: budgetOverview.totals.remaining },
                      { label: t("chocofest.balanceLabel"), value: balance.balance },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="bg-secondary/50 px-4 py-3 rounded-xl border border-border/50"
                      >
                        <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                          {card.label}
                        </div>
                        <div
                          className={`font-display font-bold ${
                            card.value < 0 ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          S/ {card.value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-3">
                    {budgetOverview.rows.map((row) => (
                      <li key={row.key} className="bg-card border border-border rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{row.category}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("chocofest.budgetPlanned")}: S/{" "}
                              {row.planned.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ·{" "}
                              {t("chocofest.budgetSpent")}: S/{" "}
                              {row.spent.toLocaleString("es-PE", { maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <span
                            className={`font-bold whitespace-nowrap ${
                              row.remaining < 0 ? "text-destructive" : "text-primary"
                            }`}
                          >
                            S/ {row.remaining.toLocaleString("es-PE", { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {row.progress.hasTarget ? (
                          <div className="mt-3">
                            <Progress value={row.progress.percent} className="h-2" />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("chocofest.budgetUnbudgeted")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyBox text={t("chocofest.budgetEmpty")} />
              )}
              <p className="text-xs text-muted-foreground mt-3">{t("chocofest.budgetNote")}</p>
            </Section>

            {/* 7. Voluntariado */}
            <Section id="voluntariado" icon={<HandHeart className="w-5 h-5" />} title={t("chocofest.sectionVolunteers")}>
              <p className="text-muted-foreground mb-4">{t("chocofest.volunteersText")}</p>
              <Link href="/voluntariado">
                <Button variant="outline" className="rounded-2xl">
                  {t("chocofest.ctaVolunteer")} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </Section>

            {/* 8. Aliados y patrocinadores: reutiliza el módulo de aliados real
                (mismo dato que /aliados), destacados primero. */}
            <Section id="aliados" icon={<Store className="w-5 h-5" />} title={t("chocofest.sectionAllies")}>
              <p className="text-muted-foreground mb-4">{t("chocofest.alliesText")}</p>
              <AlliesStrip />
            </Section>

            {/* 9. Cronograma de actividades */}
            <Section id="cronograma" icon={<Calendar className="w-5 h-5" />} title={t("chocofest.sectionTimeline")}>
              {/* Programa estructurado (hora · actividad · responsable) definido
                  desde el panel. Si aún no se ha definido, no se muestra nada:
                  nunca se inventa un programa. */}
              {program.length > 0 ? (
                <ol className="space-y-3 mb-6">
                  {program.map((activity, index) => (
                    <li
                      key={`${activity.time}-${activity.title}-${index}`}
                      className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      {activity.time ? (
                        <span className="font-display font-bold text-primary whitespace-nowrap">
                          {activity.time}
                        </span>
                      ) : null}
                      <span className="font-semibold text-foreground">{activity.title}</span>
                      {activity.responsible ? (
                        <span className="text-sm text-muted-foreground">· {activity.responsible}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {loadingUpdates ? (
                <div className="h-20 flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>
              ) : updates && updates.length > 0 ? (
                <div className="space-y-4">
                  {updates.map((u) => (
                    <div key={u.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                      <div className="text-sm font-medium text-primary mb-1">
                        {formatSafeDate(u.createdAt, t("campaignDetail.dateFormat"), {
                          locale: getDateFormatLocale(),
                        })}
                      </div>
                      <h3 className="text-lg font-bold text-foreground mb-1">{u.title}</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">{u.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBox text={t("chocofest.emptyTimeline")} />
              )}
            </Section>

            {/* 10. Localidades beneficiadas */}
            <Section id="localidades" icon={<MapPin className="w-5 h-5" />} title={t("chocofest.sectionLocalities")}>
              <EmptyBox text={t("chocofest.emptyLocalities")} />
            </Section>

            {/* 11. Galería */}
            <Section id="galeria" icon={<ImageIcon className="w-5 h-5" />} title={t("chocofest.sectionGallery")}>
              {loadingImages ? (
                <div className="h-20 flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>
              ) : images && images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedImage(img.imageUrl)}
                      className="aspect-square rounded-2xl overflow-hidden border border-border shadow-sm group"
                    >
                      <img
                        src={optimizeImageUrl(img.imageUrl, { width: 800 })}
                        alt={img.caption || t("chocofest.sectionGallery")}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyBox text={t("chocofest.emptyGallery")} />
              )}
            </Section>

            {/* 12. Transparencia financiera */}
            <Section id="transparencia" icon={<Shield className="w-5 h-5" />} title={t("chocofest.sectionTransparency")}>
              <p className="text-muted-foreground mb-4">{t("chocofest.transparencyText")}</p>
              {transparency && (
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                      {t("chocofest.raisedLabel")}
                    </div>
                    <div className="font-bold text-foreground">
                      S/ {transparency.totalRaised.toLocaleString("es-PE")}
                    </div>
                  </div>
                  <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                      {t("campaignDetail.spent")}
                    </div>
                    <div className="font-bold text-foreground">
                      S/ {transparency.publicSpent.toLocaleString("es-PE")}
                    </div>
                  </div>
                  <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/20">
                    <div className="text-xs text-primary uppercase tracking-wide font-semibold mb-1">
                      {t("campaignDetail.balance")}
                    </div>
                    <div className="font-bold text-primary">
                      S/ {transparency.balance.toLocaleString("es-PE")}
                    </div>
                  </div>
                </div>
              )}
              <Link href={`/campanas/${campaign.id}/transparencia`}>
                <Button className="rounded-2xl">
                  {t("chocofest.ctaTransparency")} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </Section>

            {/* 13. Resultados y rendición final */}
            <Section id="resultados" icon={<Sparkles className="w-5 h-5" />} title={t("chocofest.sectionResults")}>
              {/* Fase 4.3: informe de rendición de resultados. Las cifras salen de
                  los registros del sistema (dinero de la transparencia y bienes del
                  inventario); lo demás lo declara la organización, y lo que no está
                  declarado se dice así en lugar de mostrar un cero. */}
              {eventResults.hasAnything && (
                <>
                  <p className="text-sm text-muted-foreground mb-5">{t("chocofest.resultsIntro")}</p>

                  {eventResults.money.available && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      {[
                        { label: t("chocofest.resultsIncome"), value: eventResults.money.income },
                        { label: t("chocofest.resultsSpent"), value: eventResults.money.spent },
                        { label: t("chocofest.resultsBalance"), value: eventResults.money.balance },
                      ].map((tile) => (
                        <div
                          key={tile.label}
                          className="bg-card border border-border rounded-2xl p-4"
                          data-testid="event-results-money"
                        >
                          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                            {tile.label}
                          </div>
                          <div className="text-xl font-display font-bold text-foreground">
                            {tile.value === null
                              ? t("chocofest.resultsNotDeclared")
                              : `S/ ${tile.value.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {eventResults.goods.lines > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      {[
                        { label: t("chocofest.resultsGoodsReceived"), value: eventResults.goods.received },
                        { label: t("chocofest.resultsGoodsDelivered"), value: eventResults.goods.distributed },
                        { label: t("chocofest.resultsGoodsRemaining"), value: eventResults.goods.remaining },
                      ].map((tile) => (
                        <div
                          key={tile.label}
                          className="bg-card border border-border rounded-2xl p-4"
                          data-testid="event-results-goods"
                        >
                          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                            {tile.label}
                          </div>
                          <div className="text-xl font-display font-bold text-foreground">
                            {formatQuantity(tile.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-card border border-border rounded-2xl p-4" data-testid="event-results-beneficiaries">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsBeneficiaries")}
                      </div>
                      <div className="text-xl font-display font-bold text-foreground">
                        {eventResults.beneficiaries === null
                          ? t("chocofest.resultsNotDeclared")
                          : eventResults.beneficiaries.toLocaleString("es-PE")}
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4" data-testid="event-results-activities">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsActivities")}
                      </div>
                      <div className="text-xl font-display font-bold text-foreground">
                        {eventResults.activities.done > 0
                          ? eventResults.activities.planned > 0
                            ? t("chocofest.resultsActivitiesCount", {
                                done: eventResults.activities.done,
                                planned: eventResults.activities.planned,
                              })
                            : eventResults.activities.done
                          : t("chocofest.resultsNotDeclared")}
                      </div>
                    </div>
                  </div>

                  {eventResults.activities.doneList.length > 0 && (
                    <ol className="space-y-2 mb-6">
                      {eventResults.activities.doneList.map((activity, index) => (
                        <li
                          key={`${activity.title}-${index}`}
                          className="bg-secondary/40 border border-border/50 rounded-xl px-4 py-2 text-sm flex flex-wrap gap-x-3"
                        >
                          {activity.time && <span className="font-mono text-muted-foreground">{activity.time}</span>}
                          <span className="font-medium text-foreground">{activity.title}</span>
                          {activity.responsible && (
                            <span className="text-muted-foreground">· {activity.responsible}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {eventResults.summary && (
                    <p className="text-sm text-foreground whitespace-pre-line mb-6" data-testid="event-results-summary">
                      {eventResults.summary}
                    </p>
                  )}

                  {eventResults.leftoversDestination && (
                    <div
                      className="bg-secondary/50 border border-border/50 rounded-2xl p-4 mb-6"
                      data-testid="event-results-leftovers"
                    >
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsLeftoversDestination")}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-line">
                        {eventResults.leftoversDestination}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mb-5">{t("chocofest.resultsNotes")}</p>
                </>
              )}
              {resultsSummary.total > 0 ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsCountLabel")}
                      </div>
                      <div className="font-bold text-foreground">{resultsSummary.total}</div>
                    </div>
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsImagesLabel")}
                      </div>
                      <div className="font-bold text-foreground">{resultsSummary.images}</div>
                    </div>
                    <div className="bg-secondary/50 px-4 py-2 rounded-xl border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                        {t("chocofest.resultsVideosLabel")}
                      </div>
                      <div className="font-bold text-foreground">{resultsSummary.videos}</div>
                    </div>
                    {transparency && (
                      <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/20">
                        <div className="text-xs text-primary uppercase tracking-wide font-semibold mb-1">
                          {t("chocofest.resultsExecutionLabel")}
                        </div>
                        <div className="font-bold text-primary">
                          {transparency.executionPercent}%
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {publicEvidence.map((item) => (
                      <div
                        key={item.id}
                        className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
                      >
                        {!isVideoEvidence(item) && (
                          <img
                            src={optimizeImageUrl(item.mediaUrl, { width: 800 })}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-48 object-cover"
                          />
                        )}
                        <div className="p-4">
                          <h3 className="font-bold text-foreground">{item.title}</h3>
                          {item.description ? (
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                              {item.description}
                            </p>
                          ) : null}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-muted-foreground">
                              {formatSafeDate(item.date, t("campaignDetail.dateFormat"), {
                                locale: getDateFormatLocale(),
                              })}
                            </span>
                            {isVideoEvidence(item) && (
                              <a
                                href={item.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                {t("chocofest.resultsVideoCta")}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyBox text={t("chocofest.emptyResults")} />
              )}
              <p className="text-xs text-muted-foreground mt-3">{t("chocofest.resultsNote")}</p>
            </Section>
          </div>

          {/* Compartir */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {t("share.title")}
            </p>
            <ShareButtons title={campaign.title} description={t("chocofest.metaDescription")} className="flex-wrap" />
          </div>
        </div>
      </div>
    </div>
  );
}
