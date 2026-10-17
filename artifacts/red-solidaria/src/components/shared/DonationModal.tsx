import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { resolveWhatsAppContact } from "@/lib/whatsapp";

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  campaignId?: number;
  campaignTitle?: string;
  preselectProduct?: string;
}

export function DonationModal({ open, onClose, campaignTitle }: DonationModalProps) {
  const { data: settings } = usePublicSettings();
  const message = campaignTitle
    ? `Hola, quiero apoyar la campaña “${campaignTitle}”. ¿Me indican cómo coordinar mi aporte?`
    : "Hola, quiero colaborar con Red Solidaria San Ramón. ¿Me indican cómo coordinar mi aporte?";
  const whatsapp = resolveWhatsAppContact(settings, "donation", message);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle>Coordina tu aporte por WhatsApp</DialogTitle>
          <DialogDescription>
            Escríbenos y te ayudaremos a elegir la forma de colaborar. Nuestro equipo
            registrará el aporte y podrás consultarlo en la página pública de transparencia.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          {whatsapp ? (
            <Button asChild className="h-12 rounded-xl bg-green-600 text-white hover:bg-green-700">
              <a href={whatsapp.url} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Escribir al WhatsApp {whatsapp.display}
              </a>
            </Button>
          ) : (
            <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
              El número de WhatsApp aún no está configurado. Puedes escribirnos desde la página de contacto.
              {" "}<a href="/contacto" className="font-semibold text-primary underline">Ir a contacto</a>
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
