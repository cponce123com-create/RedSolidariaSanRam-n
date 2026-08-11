<div align="center">

# 🤝 Red Solidaria San Ramón

**Plataforma digital para campañas solidarias, adopción de mascotas, voluntariado y transparencia total de fondos.**

[![Status](https://img.shields.io/badge/status-en%20producci%C3%B3n-22c55e?style=flat-square)](https://redsolidariasanram-n.onrender.com)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite)](https://vitejs.dev)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f?style=flat-square)](https://orm.drizzle.team)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220?style=flat-square&logo=pnpm)](https://pnpm.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#-licencia)

🌐 **Sitio en vivo:** [redsolidariasanram-n.onrender.com](https://redsolidariasanram-n.onrender.com)

</div>

---

## 🧠 Mapa mental del proyecto

> *Diagrama interactivo — haz clic/zoom/pan sobre los nodos (Mermaid, renderizado nativo por GitHub).*

```mermaid
mindmap
  root(("Red Solidaria<br/>San Ramón"))
    Frontend
      React 19 + TypeScript
      Vite + Tailwind + shadcn/ui
      Mapa libre Leaflet + OSM
      i18n es/en
      Dark mode
    API Server
      Express 5 + TypeScript
      Helmet + rate limiting
      Sesiones + 2FA TOTP
      Roles superadmin / admin / moderador
    Datos
      PostgreSQL
      Drizzle ORM
      Ledger hash-chained
      Cloudinary imágenes
      Audit logs
    Público
      Campañas + mapa geolocalizado
      Transparencia con donantes
      Adopciones y ayuda animal
      Reportes de casos urgentes
      Panel admin completo
```

## 🏗️ Arquitectura (interactiva)

```mermaid
flowchart LR
    U["Usuario / Donante"] -->|HTTPS| FE["Frontend React<br/>Vite · Tailwind · shadcn/ui"]
    FE -->|"REST API (JSON)"| API["API Server<br/>Express 5 · Helmet · Pino"]
    API --> DB[("PostgreSQL<br/>Drizzle ORM")]
    API --> CDN[("Cloudinary<br/>comprobantes e imágenes")]
    API --> S3[("Sesiones<br/>connect-pg-simple")]
    click U "https://redsolidariasanram-n.onrender.com" "Abrir sitio en vivo"
    click FE "https://github.com/cponce123com-create/RedSolidariaSanRam-n/tree/main/artifacts/red-solidaria" "Ver código del frontend"
    click API "https://github.com/cponce123com-create/RedSolidariaSanRam-n/tree/main/artifacts/api-server" "Ver código de la API"
```

## 🔐 Flujo de acceso al panel admin

```mermaid
flowchart TD
    A["/admin/login"] --> B{2FA activo?}
    B -->|No| C["Dashboard admin"]
    B -->|Sí| D["Ingresar código TOTP<br/>(app autenticadora)"] --> C
    C --> E["Campañas · Reportes · Adopciones<br/>Noticias · Voluntarios · Aliados"]
    C --> F["Donaciones · Gastos · Evidencias<br/>(requiere rol administrador)"]
    C --> G["Usuarios · Configuración<br/>(solo superadmin)"]
```

---

## ✨ Características

| Área | Detalle |
|---|---|
| 🗺️ **Mapa de campañas** | Vista grilla/mapa con **Leaflet + OpenStreetMap** (mapa libre), pins con progreso, popups y selector visual de ubicación en el panel admin |
| 💸 **Transparencia** | Tarjetas clicables → panel con **donantes**, movimientos con **ledger hash-chained** verificable, gastos con comprobantes y evidencias |
| 🔐 **Roles** | `superadmin` (sistema) > `administrador` (dinero/operaciones) > `moderador` (contenido) — aplicados en API y UI |
| 🔑 **Login + 2FA** | Sesiones seguras con `connect-pg-simple`, TOTP, rate-limit por IP+usuario y audit logs |
| 🌍 **i18n** | Español/Inglés con `react-i18next` + tests de paridad de claves |
| 🚨 **Modo emergencia** | Banner + countdown para campañas por cerrar |
| 📱 **Mobile-first** | Navbar optimizado con menú "Más", barra inferior móvil y dark mode |
| 🛡️ **Hardening** | Helmet/CSP, `toIsoSafe` + `formatSafeDate` contra datos corruptos, montos normalizados, buscadores en el panel |

## 📦 Stack

- **Frontend:** React 19 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Framer Motion · react-leaflet · react-i18next · TanStack Query · recharts
- **Backend:** Node.js · Express 5 · TypeScript · Helmet · express-session · Drizzle ORM · Pino · bcryptjs · otplib
- **Datos:** PostgreSQL 16 · drizzle-kit · pool `pg` · ledger hash-chained (transparencia verificable)
- **Monorepo:** pnpm workspaces · orval (clientes generados desde OpenAPI) · Vitest · node:test

## 🚀 Quick Start

```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env      # completa DATABASE_URL y SESSION_SECRET

# 3. Migraciones + seed (demo)
cd lib/db && npx drizzle-kit push && cd ../..

# 4. Desarrollo (API + frontend con hot reload)
pnpm dev
```

### Variables de entorno

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/redsolidaria
SESSION_SECRET=tu-secreto-muy-largo-y-seguro
NODE_ENV=development
PORT=5173
BASE_PATH=/
CORS_ORIGIN=https://tudominio.com
# Superadmin (obligatorio en producción; en dev: admin / redsolidaria2024)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=redsolidaria2024
```

### Credenciales de administración

| Rol | Usuario (dev) | Contraseña (dev) | Acceso |
|---|---|---|---|
| 🟣 **Superadmin** | `admin` (env var) | `redsolidaria2024` | Total + usuarios + configuración + 2FA |
| 🔵 **Administrador** | `administrador` | `admin2024` | Todo lo operativo (dinero incluido) |
| 🟢 **Moderador** | `moderador` | `moderador2024` | Contenido y comunidad (sin dinero ni sistema) |

> ⚠️ Las cuentas demo del seed solo se crean en **desarrollo**. En producción, el superadmin se define por variables de entorno y los demás usuarios se crean desde *Panel → Usuarios*.

## 🏗️ Build y Deploy (Render)

- **Build:** `npm install -g pnpm --prefix ./tmp_pnpm && export PATH=$(pwd)/tmp_pnpm/bin:$PATH && pnpm install --ignore-scripts && pnpm rebuild bcrypt esbuild && cd lib/db && npx drizzle-kit push && cd ../.. && pnpm -r --filter "@workspace/api-server" --filter "@workspace/red-solidaria" --filter "@workspace/mockup-sandbox" run build`
- **Start:** `node artifacts/api-server/dist/index.mjs`
- El API sirve el frontend compilado + gzip/brotli + caché de 1 año para assets con hash

## 🧪 Testing

```bash
# API server (node:test) — 71 tests
pnpm --filter @workspace/api-server test

# Frontend (vitest + node:test) — incluye i18n, login/2FA, ledger, donación
pnpm --filter @workspace/red-solidaria test

# Typecheck de todo el workspace
pnpm typecheck

# Auditoría Lighthouse (CI): accesibilidad, SEO, best-practices y performance
# Umbrales en ./lighthouserc.json
```

## 📈 Roadmap

| Estado | Feature |
|---|---|
| ✅ | Sitemap dinámico y SEO técnico |
| ✅ | CI/CD con GitHub Actions |
| ✅ | Documentación OpenAPI + clientes generados |
| ✅ | Modo emergencia (banner + countdown) |
| ✅ | QR para compartir campañas |
| ✅ | i18n es/en + switcher |
| ✅ | Panel admin con roles (superadmin/administrador/moderador) |
| ✅ | Mapa de campañas (Leaflet + OSM) con selector visual en admin |
| ✅ | Transparencia: tarjetas clicables, donantes y ledger verificable |
| ✅ | Tests frontend (Vitest + Testing Library) |
| ✅ | Hardening: fechas/montos defensivos, CSP, hooks seguros |
| 🔄 | Analytics implementation |
| 🔄 | Service Worker para offline |

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT License — ver archivo LICENSE para detalles

## 📞 Contacto

- **Website:** https://redsolidariasanram-n.onrender.com
- **Email:** contacto@redsolidariasanramon.org

---

<div align="center">Hecho con ❤️ para la comunidad de San Ramón, Chanchamayo 🇵🇪</div>
