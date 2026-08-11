import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./lib/ErrorBoundary";
// Init global de i18next (debe correr antes del primer render)
import { getInitialLanguage } from "./lib/i18n";
import "./lib/i18n";
import "./index.css";

// Sincroniza <html lang> con la preferencia guardada (el switcher lo actualiza después)
document.documentElement.lang = getInitialLanguage();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
