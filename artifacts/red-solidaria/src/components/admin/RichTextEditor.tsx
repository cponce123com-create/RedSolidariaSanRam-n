import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  label?: string;
}

interface Tool {
  cmd: string;
  arg?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}

const TOOLS: Tool[] = [
  { cmd: "bold", icon: Bold, title: "Negrita" },
  { cmd: "italic", icon: Italic, title: "Cursiva" },
  { cmd: "underline", icon: Underline, title: "Subrayado" },
  { cmd: "formatBlock", arg: "h2", icon: Heading2, title: "Título" },
  { cmd: "formatBlock", arg: "h3", icon: Heading3, title: "Subtítulo" },
  { cmd: "insertUnorderedList", icon: List, title: "Lista" },
  { cmd: "insertOrderedList", icon: ListOrdered, title: "Lista numerada" },
];

/**
 * Editor de texto enriquecido (Fase 3): `contentEditable` + barra de formato,
 * sin dependencias externas. Produce HTML que el SERVIDOR sanea
 * (`lib/rich-text.ts`) antes de guardarlo o publicarlo: el editor no es la línea
 * de defensa contra XSS, solo la interfaz.
 */
export function RichTextEditor({ value, onChange, label }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza el HTML recibido sin pisar el cursor mientras se escribe.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    // `execCommand` está obsoleto pero sigue siendo el mecanismo más compatible
    // para un editor ligero sin dependencias.
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const url = window.prompt("Enlace (https://… o ruta interna /campanas)", "https://");
    if (url) exec("createLink", url);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex flex-wrap gap-1 rounded-t-xl border border-input bg-secondary/30 p-1.5">
        {TOOLS.map((tool) => (
          <Button
            key={tool.title}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={tool.title}
            aria-label={tool.title}
            onClick={() => exec(tool.cmd, tool.arg)}
          >
            <tool.icon className="w-4 h-4" />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Enlace"
          aria-label="Insertar enlace"
          onClick={addLink}
        >
          <Link2 className="w-4 h-4" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label ?? "Texto enriquecido"}
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        className="min-h-[180px] rounded-b-xl border border-t-0 border-input bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
      <p className="text-xs text-muted-foreground">
        El contenido se guarda como HTML seguro: se sanea en el servidor antes de publicarse.
      </p>
    </div>
  );
}
