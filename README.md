# Red Solidaria San Ramón 🤝

Plataforma digital para la gestión de campañas solidarias, adopción de mascotas, voluntariado y transparencia de fondos.

## 🚀 Stack Tecnológico

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express 5, TypeScript
- **Base de Datos**: PostgreSQL con Drizzle ORM
- **Monorepo**: pnpm workspaces

## 📦 Estructura del Proyecto

```
/workspace
├── artifacts/
│   ├── api-server/          # Servidor API REST
│   ├── red-solidaria/       # Frontend React
│   └── mockup-sandbox/      # Sandbox de desarrollo
├── lib/
│   ├── db/                  # Schema y migraciones DB
│   ├── api-client-react/    # Clientes API tipo-safe
│   └── api-zod/             # Validaciones Zod
└── package.json             # Workspace root
```

## 🛠️ Desarrollo Local

### Prerrequisitos
- Node.js 20+
- pnpm 8+
- PostgreSQL

### Instalación

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env

# Ejecutar migraciones
pnpm db:push

# Iniciar desarrollo
pnpm dev
```

### Variables de Entorno Requeridas

```env
# Base de datos
DATABASE_URL=postgresql://user:pass@localhost:5432/redsolidaria

# Seguridad
SESSION_SECRET=tu-secreto-muy-largo-y-seguro
NODE_ENV=development

# Frontend
PORT=5173
BASE_PATH=/

# Producción
STATIC_FILES_PATH=artifacts/red-solidaria/dist/public
CORS_ORIGIN=https://tudominio.com
```

## 🏗️ Build y Deploy

### Build de Producción

```bash
pnpm build
```

### Deploy en Render

1. Conectar repositorio GitHub
2. Configurar variables de entorno
3. Usar comandos:
   - **Build**: `npm install -g pnpm --prefix ./tmp_pnpm && export PATH=$(pwd)/tmp_pnpm/bin:$PATH && pnpm install --ignore-scripts && pnpm rebuild bcrypt esbuild && cd lib/db && npx drizzle-kit push && cd ../.. && pnpm -r --filter "@workspace/api-server" --filter "@workspace/red-solidaria" --filter "@workspace/mockup-sandbox" run build`
   - **Start**: `node artifacts/api-server/dist/index.mjs`

## 📊 Mejoras Recientes

### Performance ⚡
- Code splitting avanzado (React, Radix UI, Framer Motion, Charts)
- Bundle optimizado con code-splitting por ruta (React.lazy) — sin manualChunks
  (partir react/react-dom/query en chunks separados rompía la app en prod por
  imports circulares; ver comentario en vite.config.ts)
- HTTP caching optimizado (1 año para assets con hash)
- Sourcemaps SOLO en desarrollo (en producción no se exponen los .map)
- Compresión gzip/brotli en respuestas JSON del API (compression)
- Caché pública (max-age=60s) en GETs anónimos de endpoints públicos
- Logo en WebP (~2.7 KB) y assets sin uso eliminados
- Optimización de dependencias con optimizeDeps
- Lazy loading para componentes grandes

### Seguridad 🔒
- Helmet.js con configuración mejorada
  - CSP: 'unsafe-eval' solo en desarrollo
  - XSS Filter habilitado
  - HSTS con preload
  - Permitted Cross-Domain Policies: none
- Rate limiting inteligente por endpoint
  - Login: IP + email combinados
  - API general: Soporte para API keys
  - Límites específicos por tipo de acción
- SESSION_SECRET obligatorio en producción
- Validación de entrada con Zod

### Base de Datos 🗄️
- Connection pooling optimizado
- 15 índices para consultas frecuentes
- Mejora estimada: 60-80% en velocidad

### UX/UI 👥
- Error Boundaries para manejo graceful de errores
- Skeleton loaders múltiples (Card, List, Table, Dashboard, Page)
- Animaciones pulse y shine para carga percibida
- Mobile-first responsive
- Botones de recuperación en errores

### Calidad de Código 💻
- TypeScript strict mode habilitado
- .env.example documentado
- Componentes reutilizables
- Logging estructurado con Pino

## 🧪 Testing

```bash
# Tests del API server (node:test, sin dependencias extra)
pnpm --filter @workspace/api-server test

# Typecheck de todo el workspace (libs + artifacts + scripts)
pnpm typecheck

# Auditoría Lighthouse (CI): accesibilidad, best-practices, SEO y performance
# Umbrales en ./lighthouserc.json
```

El frontend aún no tiene suite propia (solo typecheck + Lighthouse CI); los tests E2E están planificados.

## 📈 Roadmap

- [x] Sitemap dinámico y SEO técnico
- [x] CI/CD con GitHub Actions
- [x] Documentación OpenAPI
- [x] Modo emergencia — banner + countdown para campañas por cerrar
- [x] QR para compartir campañas
- [x] i18n es/en (react-i18next) — switcher + 18 páginas públicas
- [x] Tests frontend (Vitest + Testing Library) — DonationModal, login/2FA, ledger
- [ ] Analytics implementation
- [ ] Service Worker para offline

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles

## 📞 Contacto

- Website: https://redsolidariasanram-n.onrender.com
- Email: contacto@redsolidariasanramon.org

---

Hecho con ❤️ para la comunidad de San Ramón



