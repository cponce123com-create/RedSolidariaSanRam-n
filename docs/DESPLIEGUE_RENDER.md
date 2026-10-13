# Despliegue en Render — Red Solidaria San Ramón

> Guía operativa. Los secretos se definen en el **dashboard de Render** (`sync: false`), nunca en el repo.

---

## 1. Blueprint (`render.yaml`)

```yaml
services:
  - type: web
    name: red-solidaria
    runtime: node
    plan: free
    buildCommand: pnpm install --frozen-lockfile && pnpm run build
    startCommand: node artifacts/api-server/dist/index.mjs
    healthCheckPath: /api/healthz
```

- **Build:** instala con lockfile congelado y ejecuta el build del root (frontend + API).
- **Start:** sirve el backend, que a su vez sirve el frontend estático (`dist/public`).
- **Artefacto:** `artifacts/api-server/dist/index.mjs` (verificado: coincide con `build.mjs`).

### Mejoras pendientes (ver INF-04/INF-05/INF-06)
- **Health check:** cambiar a `/api/readyz` (verifica la BD con `SELECT 1`) en lugar de `/api/healthz`.
- **Build:** acotar con `--filter` a `api-server`, `red-solidaria` y `lib/**` (hoy compila también `mockup-sandbox`).
- **`PORT`:** Render lo inyecta (10000); `index.ts` valida el valor.

## 2. Variables de entorno (dashboard)

| Variable | Obligatoria | Notas |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL (Neon/Render). Usada por `lib/db/src/pool.ts`. |
| `SESSION_SECRET` | ✅ | Requerido fuera de desarrollo (`app.ts`); sin default inseguro. |
| `NODE_ENV` | ✅ | `production` (activa cookie `Secure`). |
| `SITE_URL` | ✅ | URL pública (CORS/SEO). |
| `CORS_ORIGIN` | ✅ | Origen permitido (no usar `*`). |
| `CLOUDINARY_*` | ✅ | Cloud name / API key / secret (firma de subidas). |

> **Secretos:** solo en el dashboard. `.env.example` documenta las claves sin valores.

## 3. Migraciones

- **No** se usa `drizzle-kit push` (retirado en A2 por destructivo).
- `runMigrations()` (migraciones versionadas de `@workspace/db`) se ejecuta **al arrancar** y **antes** de
  `app.listen()`; si falla, el proceso sale con código 1 (A4) y Render marca el deploy como fallido.
- Migraciones de esquema nuevas: ver `docs/MIGRACIONES_Y_RESPALDOS.md` (requieren autorización).

## 4. Verificación tras el deploy

1. `GET /api/healthz` → `200 {"status":"ok"}` (liveness).
2. `GET /api/readyz` → `200 {"status":"ready","db":"ok"}` (readiness; 503 si la BD no responde).
3. `GET /api/campaigns` → lista de campañas.
4. `GET /` → SPA (título «Red Solidaria San Ramón…»).
5. `GET /campanas/chocofest-2026` → página de ChocoFest (o estado «en preparación»).

## 5. CI (`.github/workflows/ci.yml`)

Ejecuta typecheck, tests, `audit --prod`, build y Lighthouse. **No** hace deploy.
Recomendado: añadir el check de `/api/readyz` en un smoke test post-deploy.

## 6. Rollback

- Render conserva deploys anteriores → *Redeploy* de la versión previa.
- Si una migración rompió el esquema: aplicar el SQL de reversión del documento de migraciones y
  redesplegar la versión anterior.

## 7. Notas de seguridad

- Cookie de sesión: `httpOnly`, `sameSite`, `Secure` en producción (SEC-01: forzar `Secure` también si
  `SITE_URL` es `https`).
- Rate limiting y lockout 2FA son **en memoria** (SEC-02): con varias instancias el límite se multiplica;
  considerar store compartido si se escala horizontalmente.
- `proxy-addr` (DEP-01, CRÍTICO) debe actualizarse a `>=2.0.8` antes de exponer el rate-limit por IP.
