import { useState } from "react";
import { useParams, Link } from "wouter";
import { useCampaignTransparency, Evidence } from "@/hooks/use-phase3";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Shield, 
  Target, 
  TrendingUp, 
  Receipt, 
  Wallet, 
  Heart, 
  ArrowLeft,
  FileText,
  Camera,
  Download,
  Calendar,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const categoryColors: Record<string, string> = {
  alimentación: "bg-yellow-100 text-yellow-800 border-yellow-200",
  transporte: "bg-blue-100 text-blue-800 border-blue-200",
  materiales: "bg-purple-100 text-purple-800 border-purple-200",
  logística: "bg-orange-100 text-orange-800 border-orange-200",
  comunicación: "bg-teal-100 text-teal-800 border-teal-200",
  salud: "bg-red-100 text-red-800 border-red-200",
  educación: "bg-indigo-100 text-indigo-800 border-indigo-200",
  general: "bg-gray-100 text-gray-800 border-gray-200",
};

export default function CampaignTransparency() {
  const { id } = useParams();
  const campaignId = Number(id);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);

  const { data: transparency, isLoading, isError } = useCampaignTransparency(campaignId);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-32 pb-20 flex flex-col items-center text-muted-foreground">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p className="font-medium text-lg">Cargando datos de transparencia...</p>
      </div>
    );
  }

  if (isError || !transparency) {
    return (
      <div className="min-h-screen pt-32 pb-20 flex flex-col items-center">
        <Shield className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-2xl font-bold text-foreground">Información no disponible</h2>
        <p className="text-muted-foreground mt-2 mb-6">No pudimos cargar el panel de transparencia de esta campaña.</p>
        <Link href={`/campanas/${campaignId}`}>
          <Button variant="outline" className="rounded-xl">Volver a la campaña</Button>
        </Link>
      </div>
    );
  }

  const formatCurrency = (val: number) => `S/ ${val.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen pt-24 pb-24 bg-[#FAF9F6]" data-testid="transparency-page">
      
      {/* Evidence Lightbox Modal */}
      <Dialog open={!!selectedEvidence} onOpenChange={() => setSelectedEvidence(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none shadow-2xl rounded-3xl">
          {selectedEvidence && (
            <div className="relative text-white flex flex-col max-h-[90vh]">
              <div className="p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10 absolute top-0 left-0 right-0">
                <Badge className="bg-primary/90 hover:bg-primary">{selectedEvidence.evidenceType.toUpperCase()}</Badge>
                <div className="text-sm font-medium opacity-80 flex items-center gap-2">
                  <Calendar className="w-4 h-4"/> 
                  {format(new Date(selectedEvidence.date), "dd MMM yyyy", { locale: es })}
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden min-h-[300px] p-0 md:p-8">
                {selectedEvidence.mediaType === 'image' ? (
                  <img src={selectedEvidence.mediaUrl} alt={selectedEvidence.title} className="max-w-full max-h-[60vh] object-contain rounded-xl" />
                ) : (
                  <div className="flex flex-col items-center p-12 bg-white/10 rounded-2xl">
                    <FileText className="w-20 h-20 mb-4 opacity-80" />
                    <a href={selectedEvidence.mediaUrl} target="_blank" rel="noreferrer">
                      <Button className="rounded-xl"><Download className="w-4 h-4 mr-2"/> Descargar Documento</Button>
                    </a>
                  </div>
                )}
              </div>
              <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
                <h3 className="text-2xl font-bold font-display mb-2">{selectedEvidence.title}</h3>
                {selectedEvidence.description && <p className="text-gray-300 whitespace-pre-wrap">{selectedEvidence.description}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-10">
          <Link href={`/campanas/${campaignId}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver a la campaña
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-600 shadow-sm border border-green-200">
                  <Shield className="w-5 h-5" />
                </div>
                <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 px-3 py-1 font-semibold uppercase tracking-wider text-xs">
                  100% Transparente
                </Badge>
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-extrabold text-foreground tracking-tight mb-2">
                Panel de Transparencia
              </h1>
              <p className="text-xl text-muted-foreground font-medium">
                Campaña: <span className="text-foreground">{transparency.title}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-border flex flex-col relative overflow-hidden group hover-elevate">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out" />
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                <Target className="w-5 h-5" />
              </div>
              <span className="font-semibold text-muted-foreground">Meta</span>
            </div>
            <div className="text-3xl font-display font-bold text-foreground relative z-10">
              {formatCurrency(transparency.goal)}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-border flex flex-col relative overflow-hidden group hover-elevate" data-testid="transparency-raised">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-green-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out" />
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-green-100 text-green-600 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="font-semibold text-muted-foreground">Recaudado</span>
            </div>
            <div className="text-3xl font-display font-bold text-foreground relative z-10">
              {formatCurrency(transparency.totalRaised)}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-border flex flex-col relative overflow-hidden group hover-elevate" data-testid="transparency-spent">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-orange-50 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out" />
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
                <Receipt className="w-5 h-5" />
              </div>
              <span className="font-semibold text-muted-foreground">Gastado</span>
            </div>
            <div className="text-3xl font-display font-bold text-foreground relative z-10">
              {formatCurrency(transparency.publicSpent)}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-primary/20 flex flex-col relative overflow-hidden group hover-elevate" data-testid="transparency-balance">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full transition-transform group-hover:scale-150 duration-500 ease-out" />
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-sm">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="font-semibold text-foreground">Saldo Disponible</span>
            </div>
            <div className="text-3xl font-display font-bold text-primary relative z-10">
              {formatCurrency(transparency.balance)}
            </div>
          </div>
        </div>

        {/* Progress & Secondary Stats */}
        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-border">
            <div className="flex justify-between items-end mb-3">
              <h3 className="font-display font-bold text-lg text-foreground">Ejecución de Fondos</h3>
              <span className="text-3xl font-bold text-primary">{transparency.executionPercent}%</span>
            </div>
            <Progress value={transparency.executionPercent} className="h-4 rounded-full mb-3 bg-secondary/50" />
            <p className="text-sm text-muted-foreground font-medium">
              Del total recaudado, el <span className="text-foreground font-bold">{transparency.executionPercent}%</span> ya ha sido ejecutado y rendido con comprobantes en esta página.
            </p>
          </div>
          
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-border flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-pink-100 flex items-center justify-center flex-shrink-0">
              <Heart className="w-8 h-8 text-pink-500 fill-pink-500" />
            </div>
            <div>
              <div className="text-4xl font-display font-bold text-foreground mb-1">{transparency.donorCount}</div>
              <div className="text-muted-foreground font-medium leading-tight">Corazones<br/>solidarios</div>
            </div>
          </div>
        </div>

        {/* Two Column Layout for Movements and Expenses */}
        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          
          {/* Recent Movements */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border h-full">
              <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
                <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-45" /> Últimos Movimientos
              </h3>
              
              {transparency.recentMovements.length > 0 ? (
                <div className="space-y-5">
                  {transparency.recentMovements.map((mov, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className={`mt-0.5 p-2 rounded-full flex-shrink-0 ${mov.type === 'ingreso' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                        {mov.type === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{mov.description}</p>
                          <span className={`text-sm font-bold whitespace-nowrap ${mov.type === 'ingreso' ? 'text-green-600' : 'text-foreground'}`}>
                            {mov.type === 'ingreso' ? '+' : '-'}{formatCurrency(mov.amount)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mov.date), "dd MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>Sin movimientos aún</p>
                </div>
              )}
            </div>
          </div>

          {/* Expenses Table */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-border h-full flex flex-col" data-testid="transparency-expenses-table">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-display font-bold flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" /> Rendición de Gastos
                </h3>
                <Badge variant="secondary" className="px-3 py-1 font-medium">{transparency.publicExpenseCount} registros</Badge>
              </div>

              <div className="flex-1 overflow-x-auto rounded-2xl border border-border/50">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground">Fecha</TableHead>
                      <TableHead className="font-semibold text-foreground">Descripción</TableHead>
                      <TableHead className="font-semibold text-foreground">Categoría</TableHead>
                      <TableHead className="text-right font-semibold text-foreground">Monto</TableHead>
                      <TableHead className="text-center font-semibold text-foreground">Comp.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transparency.publicExpenses.length > 0 ? (
                      transparency.publicExpenses.map((exp) => (
                        <TableRow key={exp.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(exp.date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {exp.description}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize text-xs font-semibold ${categoryColors[exp.category] || categoryColors.general}`}>
                              {exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold whitespace-nowrap">
                            {formatCurrency(exp.amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {exp.receiptUrl ? (
                              <a href={exp.receiptUrl} target="_blank" rel="noreferrer" title="Ver comprobante" className="inline-flex p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors">
                                <FileText className="w-4 h-4" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground/30">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                          No hay gastos públicos registrados en esta campaña.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              
              <div className="mt-6 pt-5 border-t border-border flex justify-between items-center bg-gray-50 p-4 rounded-2xl">
                <span className="font-medium text-muted-foreground">Total Rendido:</span>
                <span className="text-2xl font-display font-bold text-foreground">{formatCurrency(transparency.publicSpent)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Evidence Grid */}
        <div className="mb-12" data-testid="transparency-evidence-grid">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold flex items-center gap-3 text-foreground mb-2">
                <Camera className="w-8 h-8 text-primary" /> Evidencias de Impacto
              </h2>
              <p className="text-muted-foreground font-medium">Fotos y documentos que demuestran el resultado de la campaña.</p>
            </div>
            <Badge variant="secondary" className="px-4 py-1.5 text-sm">{transparency.publicEvidenceCount} evidencias</Badge>
          </div>

          {transparency.publicEvidence.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {transparency.publicEvidence.map((ev) => (
                <div 
                  key={ev.id} 
                  className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col group cursor-pointer hover-elevate transition-all duration-300"
                  onClick={() => setSelectedEvidence(ev)}
                >
                  <div className="aspect-[4/3] relative overflow-hidden bg-secondary flex items-center justify-center">
                    {ev.mediaType === 'image' ? (
                      <>
                        <img src={ev.mediaUrl} alt={ev.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye className="text-white opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 drop-shadow-md" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <FileText className="w-12 h-12 mb-2 opacity-50" />
                        <span className="text-sm font-medium">Ver Documento</span>
                      </div>
                    )}
                    <Badge className="absolute top-3 right-3 bg-black/60 backdrop-blur-md hover:bg-black/80 border-none">
                      {ev.evidenceType}
                    </Badge>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="text-xs text-primary font-medium mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5"/> {format(new Date(ev.date), "dd MMM yyyy", { locale: es })}
                    </div>
                    <h3 className="font-bold text-foreground leading-tight mb-2 line-clamp-2">{ev.title}</h3>
                    {ev.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-auto">{ev.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-border p-16 text-center shadow-sm">
              <Camera className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-2">Sin evidencias aún</h3>
              <p className="text-muted-foreground">Las fotos y reportes de impacto aparecerán aquí una vez que se realicen las actividades.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
