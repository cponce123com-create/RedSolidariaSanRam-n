import { Campaign } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isUrgent, daysUntilEnd } from "@/lib/campaign-urgency";

interface CampaignCardProps {
  campaign: Campaign;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const { t } = useTranslation();
  const progress = campaign.goal > 0 ? Math.min(100, Math.round((campaign.raised / campaign.goal) * 100)) : 0;
  // Fase 3 (modo emergencia): badge "Cierra en Xd" en tarjetas por cerrar
  const urgent = isUrgent(campaign);
  const daysLeft = daysUntilEnd(campaign.endDate);
  
  return (
    <Card className="overflow-hidden flex flex-col hover-elevate border-border/50 group bg-card">
      <div className="relative h-48 sm:h-56 overflow-hidden">
        {/* Unsplash placeholder logic based on category if image is missing */}
        <img 
          src={campaign.imageUrl || `https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80`} 
          alt={campaign.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-4 left-4 flex gap-2">
          {campaign.status === 'active' ? (
            <Badge className="bg-accent hover:bg-accent/90 text-white border-none shadow-sm">{t("campaignCard.active")}</Badge>
          ) : (
            <Badge variant="secondary" className="shadow-sm">{t("campaignCard.completed")}</Badge>
          )}
          {campaign.featured && (
            <Badge className="bg-primary hover:bg-primary/90 text-white border-none shadow-sm">{t("campaignCard.featured")}</Badge>
          )}
        </div>
        {urgent && daysLeft !== null && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-red-600 hover:bg-red-700 text-white border-none shadow-sm gap-1">
              <Flame className="w-3 h-3" />
              {daysLeft <= 1 ? t("campaignCard.lastDay") : t("campaignCard.closesInDays", { days: daysLeft })}
            </Badge>
          </div>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-grow">
        <div className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">
          {campaign.category}
        </div>
        <h3 className="font-display font-bold text-xl mb-2 line-clamp-2 text-foreground group-hover:text-primary transition-colors">
          {campaign.title}
        </h3>
        <p className="text-muted-foreground text-sm line-clamp-2 mb-6 flex-grow">
          {campaign.description}
        </p>
        
        <div className="space-y-4 mt-auto">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-foreground">S/ {campaign.raised.toLocaleString()}</span>
              <span className="text-muted-foreground">{t("campaignCard.ofGoal", { goal: campaign.goal.toLocaleString() })}</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-right text-xs text-muted-foreground font-medium">
              {t("campaignCard.progress", { progress })}
            </div>
          </div>
          
          <Link href={`/campanas/${campaign.id}`} className="block">
            <Button className="w-full rounded-xl" variant={campaign.status === 'active' ? 'default' : 'outline'}>
              {campaign.status === 'active' ? t("campaignCard.support") : t("campaignCard.viewResults")}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
