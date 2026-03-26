import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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

function Router() {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");

  if (isAdmin) {
    return (
      <Switch>
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/:rest*">
          <AdminLayout>
            <Switch>
              {/* If we hit /admin, redirect to campaigns or show dashboard */}
              <Route path="/admin" component={AdminCampaigns} />
              <Route path="/admin/campanas" component={AdminCampaigns} />
              <Route path="/admin/campanas/:id" component={AdminCampaignDetail} />
              <Route path="/admin/donaciones" component={AdminDonations} />
              <Route path="/admin/noticias" component={() => <div className="p-8">Módulo Noticias en Construcción</div>} />
              <Route path="/admin/mensajes" component={() => <div className="p-8">Módulo Mensajes en Construcción</div>} />
              <Route component={NotFound} />
            </Switch>
          </AdminLayout>
        </Route>
      </Switch>
    );
  }

  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/nosotros" component={About} />
        <Route path="/campanas" component={Campaigns} />
        <Route path="/campanas/:id" component={CampaignDetail} />
        <Route path="/noticias" component={News} />
        {/* Detail route for news could be added here similar to campaigns */}
        <Route path="/contacto" component={Contact} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
