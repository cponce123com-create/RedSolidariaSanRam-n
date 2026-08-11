import { lazy, Suspense, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { FloatingWhatsApp } from "./components/layout/FloatingWhatsApp";
import MobileBottomNav from "./components/shared/MobileBottomNav";

// Carga diferida por página: cada ruta descarga su chunk solo cuando se visita
const Home = lazy(() => import("./pages/home"));
const About = lazy(() => import("./pages/about"));
const Campaigns = lazy(() => import("./pages/campaigns"));
const CampaignDetail = lazy(() => import("./pages/campaign-detail"));
const CampaignTransparency = lazy(() => import("./pages/campaign-transparency"));
const Transparency = lazy(() => import("./pages/transparency"));
const News = lazy(() => import("./pages/news"));
const Contact = lazy(() => import("./pages/contact"));
const NotFound = lazy(() => import("./pages/not-found"));
const ReportForm = lazy(() => import("./pages/report-form"));
const UrgentCases = lazy(() => import("./pages/urgent-cases"));
const Adoptions = lazy(() => import("./pages/adoptions"));
const PetDetail = lazy(() => import("./pages/pet-detail"));
const SubmitPet = lazy(() => import("./pages/submit-pet"));
const AnimalWelfare = lazy(() => import("./pages/animal-welfare"));
const Volunteer = lazy(() => import("./pages/volunteer"));
const HowToHelp = lazy(() => import("./pages/how-to-help"));
const Allies = lazy(() => import("./pages/allies"));
const StockCatalog = lazy(() => import("./pages/stock-catalog"));

// Panel admin: se descarga solo al entrar a /admin (incluye recharts)
const AdminLogin = lazy(() => import("./pages/admin/login"));
const AdminLayout = lazy(() => import("./pages/admin/layout"));
const AdminCampaigns = lazy(() => import("./pages/admin/campaigns"));
const AdminCampaignDetail = lazy(() => import("./pages/admin/campaign-detail"));
const AdminDonations = lazy(() => import("./pages/admin/donations"));
const AdminReports = lazy(() => import("./pages/admin/reports"));
const AdminReportDetail = lazy(() => import("./pages/admin/report-detail"));
const AdminAdoptions = lazy(() => import("./pages/admin/adoptions"));
const AdminPetForm = lazy(() => import("./pages/admin/pet-form"));
const AdminVolunteers = lazy(() => import("./pages/admin/volunteers"));
const AdminAllies = lazy(() => import("./pages/admin/allies"));
const AdminDashboard = lazy(() => import("./pages/admin/dashboard"));
const AdminNews = lazy(() => import("./pages/admin/news"));
const AdminMessages = lazy(() => import("./pages/admin/messages"));
const AdminTestimonials = lazy(() => import("./pages/admin/testimonials"));
const AdminFaq = lazy(() => import("./pages/admin/faq"));
const AdminUsers = lazy(() => import("./pages/admin/users"));
const AdminSettings = lazy(() => import("./pages/admin/settings"));

// Caché de 60s + sin refetch al enfocar la pestaña: al volver al home (o navegar
// de vuelta) los datos ya cacheados se muestran al instante, sin recargar.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function MainLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-card focus:text-primary focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-lg"
      >
        {t("common.skipToContent")}
      </a>
      <Navbar />
      <main id="main-content" className="flex-grow pb-16 md:pb-0">{children}</main>
      <Footer />
      <FloatingWhatsApp />
      <MobileBottomNav />
    </div>
  );
}

function PageLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              {/* Admin routes */}
              <Route path="/admin/login" component={AdminLogin} />
              <Route path="/admin/voluntarios">
                <AdminLayout>
                  <AdminVolunteers />
                </AdminLayout>
              </Route>
              <Route path="/admin/aliados">
                <AdminLayout>
                  <AdminAllies />
                </AdminLayout>
              </Route>
              <Route path="/admin/adopciones/nueva">
                <AdminLayout>
                  <AdminPetForm />
                </AdminLayout>
              </Route>
              <Route path="/admin/adopciones/:id">
                <AdminLayout>
                  <AdminPetForm />
                </AdminLayout>
              </Route>
              <Route path="/admin/adopciones">
                <AdminLayout>
                  <AdminAdoptions />
                </AdminLayout>
              </Route>
              <Route path="/admin/campanas/:id">
                <AdminLayout>
                  <AdminCampaignDetail />
                </AdminLayout>
              </Route>
              <Route path="/admin/campanas">
                <AdminLayout>
                  <AdminCampaigns />
                </AdminLayout>
              </Route>
              <Route path="/admin/donaciones">
                <AdminLayout>
                  <AdminDonations />
                </AdminLayout>
              </Route>
              <Route path="/admin/reportes/:id">
                <AdminLayout>
                  <AdminReportDetail />
                </AdminLayout>
              </Route>
              <Route path="/admin/reportes">
                <AdminLayout>
                  <AdminReports />
                </AdminLayout>
              </Route>
              <Route path="/admin/noticias">
                <AdminLayout>
                  <AdminNews />
                </AdminLayout>
              </Route>
              <Route path="/admin/mensajes">
                <AdminLayout>
                  <AdminMessages />
                </AdminLayout>
              </Route>
              <Route path="/admin/testimonios">
                <AdminLayout>
                  <AdminTestimonials />
                </AdminLayout>
              </Route>
              <Route path="/admin/faq">
                <AdminLayout>
                  <AdminFaq />
                </AdminLayout>
              </Route>
              <Route path="/admin/usuarios">
                <AdminLayout>
                  <AdminUsers />
                </AdminLayout>
              </Route>
              <Route path="/admin/configuracion">
                <AdminLayout>
                  <AdminSettings />
                </AdminLayout>
              </Route>
              <Route path="/admin">
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              </Route>

              {/* Public routes */}
              <Route path="/campanas/:id/transparencia">
                <MainLayout>
                  <CampaignTransparency />
                </MainLayout>
              </Route>
              <Route path="/transparencia">
                <MainLayout>
                  <Transparency />
                </MainLayout>
              </Route>
              <Route path="/campanas/:id">
                <MainLayout>
                  <CampaignDetail />
                </MainLayout>
              </Route>
              <Route path="/campanas">
                <MainLayout>
                  <Campaigns />
                </MainLayout>
              </Route>
              <Route path="/casos-urgentes">
                <MainLayout>
                  <UrgentCases />
                </MainLayout>
              </Route>
              <Route path="/reportar">
                <MainLayout>
                  <ReportForm />
                </MainLayout>
              </Route>
              <Route path="/adopciones/:id">
                <MainLayout>
                  <PetDetail />
                </MainLayout>
              </Route>
              <Route path="/adopciones">
                <MainLayout>
                  <Adoptions />
                </MainLayout>
              </Route>
              <Route path="/publicar-mascota">
                <MainLayout>
                  <SubmitPet />
                </MainLayout>
              </Route>
              <Route path="/ayuda-animal">
                <MainLayout>
                  <AnimalWelfare />
                </MainLayout>
              </Route>
              <Route path="/voluntariado">
                <MainLayout>
                  <Volunteer />
                </MainLayout>
              </Route>
              <Route path="/como-ayudar">
                <MainLayout>
                  <HowToHelp />
                </MainLayout>
              </Route>
              <Route path="/aliados">
                <MainLayout>
                  <Allies />
                </MainLayout>
              </Route>
              <Route path="/nosotros">
                <MainLayout>
                  <About />
                </MainLayout>
              </Route>
              <Route path="/noticias">
                <MainLayout>
                  <News />
                </MainLayout>
              </Route>
              <Route path="/contacto">
                <MainLayout>
                  <Contact />
                </MainLayout>
              </Route>
              <Route path="/catalogo">
                <MainLayout>
                  <StockCatalog />
                </MainLayout>
              </Route>
              <Route path="/">
                <MainLayout>
                  <Home />
                </MainLayout>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
