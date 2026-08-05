import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UploadCloud, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadImageToCloudinary, validateProofImage } from "@/lib/cloudinary-upload";

interface ImageUploadFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  label?: string;
}

/**
 * Campo de imagen con subida directa a Cloudinary (firma admin).
 * Muestra vista previa si ya hay una URL; permite pegar URL manualmente.
 */
export function ImageUploadField({ value, onChange, label = "Imagen" }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    const error = validateProofImage(file);
    if (error) {
      toast({ title: "Archivo inválido", description: error, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file, "/api/uploads/admin-signature");
      onChange(result.imageUrl);
      toast({ title: "Imagen subida", description: "La imagen se guardó correctamente." });
    } catch (err) {
      toast({
        title: "Error al subir",
        description: err instanceof Error ? err.message : "Intenta de nuevo más tarde.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
          <img src={value} alt={label} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="text-xs bg-background rounded-lg"
              placeholder="https://..."
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 flex-shrink-0"
            onClick={() => onChange("")}
            title="Quitar imagen"
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
          <p className="text-xs font-medium mt-1">{uploading ? "Subiendo..." : "Subir imagen"}</p>
          <p className="text-[10px] text-muted-foreground">JPG/PNG/WebP · máx 8MB</p>
        </div>
      )}
    </div>
  );
}
