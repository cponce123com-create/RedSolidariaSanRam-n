import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UploadCloud, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { uploadImageToCloudinary, validateProofImage } from "@/lib/cloudinary-upload";

interface ImageUploadFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: string;
  // Endpoint de firma: admin por defecto; formularios públicos usan
  // "/api/uploads/signature" (rate limitado por IP, sin sesión).
  endpoint?: "/api/uploads/signature" | "/api/uploads/admin-signature";
}

/**
 * Campo de imagen con subida directa a Cloudinary (firma admin o pública).
 * Muestra vista previa si ya hay una URL; permite pegar URL manualmente.
 * Traducido (react-i18next): se usa tanto en el panel admin como en
 * formularios públicos.
 */
export function ImageUploadField({ value, onChange, label, endpoint = "/api/uploads/admin-signature" }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleFile = async (file: File) => {
    const error = validateProofImage(file);
    if (error) {
      toast({
        title: t("imageUpload.invalidFile"),
        description: error === "size" ? t("donation.proofSizeError") : t("donation.proofTypeError"),
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file, endpoint);
      onChange(result.imageUrl);
      toast({ title: t("imageUpload.uploaded"), description: t("imageUpload.uploadedDescription") });
    } catch (err) {
      toast({
        title: t("imageUpload.uploadError"),
        description: err instanceof Error ? err.message : t("imageUpload.retry"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resolvedLabel = label ?? t("imageUpload.label");

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
          <img src={value} alt={resolvedLabel} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="text-xs bg-background rounded-lg"
              placeholder={t("imageUpload.placeholder")}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 flex-shrink-0"
            onClick={() => onChange("")}
            title={t("imageUpload.removeTitle")}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-primary/30 rounded-xl p-4 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {uploading ? (
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          ) : (
            <UploadCloud className="w-6 h-6 text-primary mx-auto" />
          )}
          <p className="text-xs font-medium mt-1">{uploading ? t("imageUpload.uploading") : t("imageUpload.upload")}</p>
          <p className="text-[10px] text-muted-foreground">{t("imageUpload.formats")}</p>
        </div>
      )}
    </div>
  );
}
