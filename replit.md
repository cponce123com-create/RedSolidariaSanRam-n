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

### Features (Phase 1)
- **Home**: Hero, impact stats, featured campaigns, how to help, transparency, testimonials, CTA, footer
- **Nosotros (About)**: History, mission, vision, values, team
- **Campañas (Campaigns)**: Active and completed campaigns with progress bars
- **Noticias (News)**: Blog/news listing and detail pages
- **Contacto (Contact)**: Contact form, volunteer registration
- **Admin Panel**: Login-protected dashboard to manage campaigns, news, testimonials, stats, volunteers, messages

### Admin Credentials
- Username: `admin`
- Password: `redsolidaria2024`

### Color Palette
- Primary: Coral red (HSL: 0 77% 58%)
- Background: Warm white
- Accent: Green (hope/success)

### API Routes
All routes served at `/api`:
- `GET/POST /campaigns` - Campaign management
- `GET/PUT/DELETE /campaigns/:id` - Single campaign
- `GET/POST /news` - News management
- `GET/PUT/DELETE /news/:id` - Single news post
- `GET/POST /testimonials` - Testimonials
- `GET/PUT /stats` - Impact statistics
- `POST /contact` - Contact form submission
- `GET /contact/messages` - View messages (admin)
- `POST /volunteers` - Volunteer registration
- `GET /volunteers` - List volunteers (admin)
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
- `volunteers` - Volunteer registrations

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
