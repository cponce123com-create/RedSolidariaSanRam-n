import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { MessageSquare, Search, Mail, Phone, Calendar, ChevronDown, ChevronUp } from "lucide-react";

interface Message {
  id: number; name: string; email: string; phone: string | null;
  subject: string | null; message: string; createdAt: string;
}

function MessageRow({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 font-bold text-blue-700">
            {msg.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{msg.name}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{msg.email}</span>
                  {msg.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{msg.phone}</span>}
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(msg.createdAt).toLocaleDateString("es-PE")}</span>
                </div>
                {msg.subject && <p className="text-sm font-medium mt-1 text-muted-foreground">{msg.subject}</p>}
              </div>
              <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {!expanded && <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{msg.message}</p>}
          </div>
        </div>
        {expanded && (
          <div className="mt-4 pl-14 border-t border-border pt-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground bg-secondary/30 rounded-xl p-4">{msg.message}</p>
            <div className="flex gap-3 mt-3">
              <a href={`mailto:${msg.email}?subject=Re: ${msg.subject || "Contacto Red Solidaria"}`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Responder por email
              </a>
              {msg.phone && (
                <a href={`https://wa.me/51${msg.phone.replace(/\s/g, "")}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-green-700 hover:underline flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminMessages() {
  const [search, setSearch] = useState("");

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/contact/messages"],
    queryFn: async () => {
      const res = await fetch("/api/contact/messages", { credentials: "include" });
      return res.json();
    },
  });

  const filtered = messages.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.subject || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black">Mensajes</h1>
          <p className="text-muted-foreground mt-1">Consultas recibidas del formulario de contacto</p>
        </div>
        <div className="bg-secondary/40 rounded-xl px-4 py-2 text-sm font-semibold">
          {messages.length} mensaje{messages.length !== 1 ? "s" : ""} en total
        </div>
      </div>

      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, email o asunto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/30" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="bg-card border border-border rounded-2xl h-24 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-secondary/20 rounded-2xl">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{search ? "No hay mensajes que coincidan." : "No hay mensajes de contacto aún."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => <MessageRow key={m.id} msg={m} />)}
        </div>
      )}
    </div>
  );
}
