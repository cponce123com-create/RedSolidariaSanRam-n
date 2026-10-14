import { MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { resolveWhatsAppContact } from "@/lib/whatsapp";

/**
 * Botón flotante de contacto (Fase 7 del Prompt Maestro V7).
 *
 * El número estaba FIJO en el código. Ahora se lee de `settings` (editable
 * desde el panel) y, si la organización todavía no lo ha configurado, el botón
 * no se muestra: es preferible no ofrecer contacto a abrir un número
 * inventado o de ejemplo.
 */
export function FloatingWhatsApp() {
  const { t } = useTranslation();
  const { data: settings } = usePublicSettings();
  const contact = resolveWhatsAppContact(settings, "general", t("whatsapp.message"));

  if (!contact) return null;

  return (
    <motion.a
      href={contact.url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-xl shadow-[#25D366]/30 hover:scale-110 transition-transform duration-300"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      <MessageCircle className="w-7 h-7" />
      <span className="sr-only">{t("whatsapp.aria")}</span>
    </motion.a>
  );
}
