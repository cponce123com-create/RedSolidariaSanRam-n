import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { FloatingWhatsApp } from "./components/layout/FloatingWhatsApp";

import Home from "./pages/home";
import About from "./pages/about";
import Campaigns from "./pages/campaigns";
import CampaignDetail from "./pages/campaign-detail";
import CampaignTransparency from "./pages/campaign-transparency";
import News from "./pages/news";
import Contact from "./pages/contact";
import NotFound from "./pages/not-found";

import AdminLogin from "./pages/admin/login";
import AdminLayout from "./pages/admin/layout";
import AdminCampaigns from "./pages/admin/campaigns";
import AdminCampaignDetail from "./pages/admin/campaign-detail";
import AdminDonations from "./pages/admin/donations";
import AdminReports from "./pages/admin/reports";
import AdminReportDetail from "./pages/admin/report-detail";
import AdminAdoptions from "./pages/admin/adoptions";
import AdminPetForm from "./pages/admin/pet-form";
import ReportForm from "./pages/report-form";
import UrgentCases from "./pages/urgent-cases";
import Adoptions from "./pages/adoptions";
import PetDetail from "./pages/pet-detail";
import SubmitPet from "./pages/submit-pet";
import AnimalWelfare from "./pages/animal-welfare";
import Volunteer from "./pages/volunteer";
import HowToHelp from "./pages/how-to-help";
import Allies from "./pages/allies";
import AdminVolunteers from "./pages/admin/volunteers";
import AdminAllies from "./pages/admin/allies";
import AdminDashboard from "./pages/admin/dashboard";
import AdminNews from "./pages/admin/news";
import AdminMessages from "./pages/admin/messages";
import AdminTestimonials from "./pages/admin/testimonials";
import AdminFaq from "./pages/admin/faq";
import AdminUsers from "./pages/admin/users";

const queryClient = new QueryClient();

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
      <FloatingWhatsApp />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
            <Route path="/">
              <MainLayout>
                <Home />
              </MainLayout>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
