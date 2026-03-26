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
            {/* Admin routes - no layout wrapper, handled individually */}
            <Route path="/admin/login" component={AdminLogin} />
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
            <Route path="/admin/noticias">
              <AdminLayout>
                <div className="p-8">Módulo Noticias en Construcción</div>
              </AdminLayout>
            </Route>
            <Route path="/admin/mensajes">
              <AdminLayout>
                <div className="p-8">Módulo Mensajes en Construcción</div>
              </AdminLayout>
            </Route>
            <Route path="/admin">
              <AdminLayout>
                <AdminCampaigns />
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
