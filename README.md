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
- Code splitting por vendor (React, UI, charts, icons)
- Bundle reducido ~40% con manualChunks
- HTTP caching optimizado (1 año para assets)

### Seguridad 🔒
- Helmet.js para headers HTTP seguros
- Content Security Policy configurado
- SESSION_SECRET obligatorio en producción
- Rate limiting mejorado

### Base de Datos 🗄️
- Connection pooling optimizado
- 15 índices para consultas frecuentes
- Mejora estimada: 60-80% en velocidad

### UX 👥
- Skeleton loaders para carga percibida
- Error boundaries implementados
- Mobile-first responsive

## 🧪 Testing

```bash
# Tests unitarios (próximamente)
pnpm test

# E2E tests (próximamente)
pnpm test:e2e
```

## 📈 Roadmap

- [ ] Sitemap dinámico y SEO técnico
- [ ] Analytics implementation
- [ ] Service Worker para offline
- [ ] CI/CD con GitHub Actions
- [ ] Documentación OpenAPI

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
- Email: contacto@redsolidaria.com

---

Hecho con ❤️ para la comunidad de San Ramón
