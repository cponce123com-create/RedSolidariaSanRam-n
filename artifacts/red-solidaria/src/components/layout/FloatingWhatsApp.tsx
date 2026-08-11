import { MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function FloatingWhatsApp() {
  const { t } = useTranslation();
  const whatsappUrl = `https://wa.me/51921615737?text=${encodeURIComponent(t("whatsapp.message"))}`;

  return (
    <motion.a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-xl shadow-[#25D366]/30 hover:scale-110 transition-transform duration-300"
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
