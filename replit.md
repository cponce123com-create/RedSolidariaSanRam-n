# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite (Wouter routing, TanStack Query, Tailwind CSS, shadcn/ui)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── red-solidaria/      # Red Solidaria San Ramón website (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Red Solidaria San Ramón

A full-stack NGO/solidarity organization website for Red Solidaria San Ramón (Chanchamayo, Peru).

### Features — Phases 1–7 Complete

**Phase 1 - Informational Website:**
- **Home**: Hero, impact stats, featured campaigns, how to help, transparency, testimonials, CTA, footer
- **Nosotros (About)**: History, mission, vision, values, team
- **Campañas (Campaigns)**: Active and completed campaigns with progress bars
- **Noticias (News)**: Blog/news listing
- **Contacto (Contact)**: Contact form, volunteer registration
- **Admin Panel**: Login-protected dashboard

**Phase 2 - Fundraising Platform:**
- **DonationModal**: Multi-step donation form (Yape, Plin, BCP, cash)
- **CampaignDetail**: Enhanced page with gallery and updates tabs
- **Admin Donations**: Manage and approve/reject donation records
- **Admin Campaign Detail**: Manage gallery images and news updates
- Payment methods: Yape (987 654 321), Plin (987 654 321), BCP (193-12345678-0-55)

**Phase 3 - Transparency & Accountability:**
- **Public Transparency Dashboard** (`/campanas/:id/transparencia`): Meta, Recaudado, Gastado, Saldo, Ejecución %
- **Admin Gastos Tab**: Register and manage campaign expenses with receipts and visibility controls
- **Admin Evidencias Tab**: Upload and manage evidence photos/documents with type labeling
- Expense categories: alimentación, transporte, materiales, logística, comunicación, salud, educación, general
- Evidence types: compra, entrega, actividad, resultado, reporte

### Admin Credentials
- Username: `admin`
- Password: `redsolidaria2024`

### Color Palette
- Primary: Coral red (HSL: 0 77% 58%)
- Background: Warm white
- Accent: Green (hope/success)

### Routing (App.tsx)
Uses flat wouter Switch (NOT nested Switch inside Route) for reliable route matching:
- `/admin/login` → AdminLogin
- `/admin/campanas/:id` → AdminLayout + AdminCampaignDetail
- `/admin/campanas` → AdminLayout + AdminCampaigns
- `/admin/donaciones` → AdminLayout + AdminDonations
- `/campanas/:id/transparencia` → MainLayout + CampaignTransparency
- `/campanas/:id` → MainLayout + CampaignDetail
- etc.

**IMPORTANT:** Do NOT use nested `<Switch>` inside `<Route>` - use flat Switch structure. Nested Switches in wouter caused blank pages for routes with params.

### API Routes
All routes served at `/api`:
- `GET/POST /campaigns` - Campaign management
- `GET/PUT/DELETE /campaigns/:id` - Single campaign
- `GET/POST /campaigns/:id/donations` - Donations per campaign
- `GET/POST /campaigns/:id/images` - Gallery images
- `DELETE /campaigns/:id/images/:imageId` - Delete image
- `GET/POST /campaigns/:id/updates` - Campaign updates/news
- `DELETE /campaigns/:id/updates/:updateId` - Delete update
- `GET/POST /campaigns/:id/expenses` - Expense records (admin)
- `PUT/DELETE /campaigns/:id/expenses/:expenseId` - Single expense
- `GET/POST /campaigns/:id/evidence` - Evidence records
- `PUT/DELETE /campaigns/:id/evidence/:evidenceId` - Single evidence
- `GET /campaigns/:id/transparency` - Public transparency data
- `GET/POST /donations` - All donations (admin)
- `PUT /donations/:id/status` - Approve/reject donations
- `GET /donations/stats` - Donation statistics
- `POST /contact` - Contact form submission
- `GET /contact/messages` - View messages (admin)
- `POST /volunteers` - Volunteer registration
- `POST /admin/login` - Admin login
- `POST /admin/logout` - Admin logout
- `GET /admin/me` - Current session check

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Database Schema

Tables:
- `campaigns` - Solidarity campaigns with goals and progress
- `news` - Blog/news posts
- `testimonials` - Community testimonials
- `stats` - Impact statistics (key-value store)
- `contact_messages` - Contact form submissions
- `volunteers` - Volunteer registrations (Phase 6: age, district, interests, status, adminNotes)
- `donations` - Campaign donations (Yape/Plin/BCP/efectivo) with approval workflow
- `campaign_updates` - Progress updates per campaign
- `campaign_images` - Gallery images per campaign
- `campaign_expenses` - Expense records per campaign (Phase 3)
- `campaign_evidence` - Photo/document evidence per campaign (Phase 3)
- `community_reports` - Community-submitted urgent case reports (Phase 4)
- `pets` - Animal adoption listings with health/status info (Phase 5)
- `adoption_requests` - Adoption applications submitted by the public (Phase 5)
- `allies` - Partner organizations and sponsors (Phase 6)
- `faq` - Frequently asked questions with categories and sort order (Phase 7)
- `admin_users` - Additional admin users with roles (superadmin/administrador/moderador) (Phase 7)

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, session, routes at `/api`
- Routes: `src/routes/index.ts` mounts all routers
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `artifacts/red-solidaria` (`@workspace/red-solidaria`)

React + Vite frontend for Red Solidaria San Ramón website. All pages in Spanish.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`.
