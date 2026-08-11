import { useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Download, Copy, Check, QrCode } from "lucide-react";

interface CampaignQRDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
}

/**
 * Modal de QR para compartir una campaña: muestra el código escaneable,
 * permite descargarlo como PNG de alta resolución y copiar el enlace directo.
 * `qrcode.react` entra en el bundle solo cuando se abre este modal
 * (import lazy desde campaign-detail).
 */
export default function CampaignQRDialog({ open, onClose, title, url }: CampaignQRDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "red-solidaria-campana-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast({ title: t("qr.downloaded"), description: t("qr.downloadedDescription") });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: t("qr.linkCopied"), description: t("qr.linkCopiedDescription") });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t("common.copyError"),
        description: t("common.copyErrorDescription"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm" data-testid="campaign-qr-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" /> {t("qr.shareCampaign")}
          </DialogTitle>
          <DialogDescription>
            {t("qr.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <QRCodeSVG
              value={url}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              aria-label={t("qr.qrAria", { title })}
            />
          </div>

          <p className="text-sm font-semibold text-center line-clamp-2 text-foreground">{title}</p>

          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" onClick={handleDownload}>
              <Download className="w-4 h-4" /> {t("qr.download")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? t("qr.copied") : t("qr.copyLink")}
            </Button>
          </div>
        </div>

        {/* Canvas invisible: solo se usa como fuente para el PNG de alta resolución */}
        <div className="sr-only" aria-hidden="true">
          <QRCodeCanvas ref={canvasRef} value={url} size={1024} level="M" bgColor="#ffffff" fgColor="#0a0a0a" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
