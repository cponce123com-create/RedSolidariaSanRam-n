# Auditoría de Accesibilidad — Red Solidaria San Ramón

**Fecha:** 6 de agosto de 2026
**Método:** Revisión estática de código (HTML/JSX generado, componentes y clases) en `artifacts/red-solidaria`.
**Limitación:** No se ejecutó Lighthouse ni axe (requieren navegador headless, no disponible en el entorno). Los hallazgos de contraste y foco requieren validación con Lighthouse en un entorno con Chrome.

---

## Resumen

La base de accesibilidad es **buena para una app de este tamaño**: los formularios usan `label` correctos (shadcn `FormLabel`), las imágenes tienen `alt` (las decorativas usan `alt=""`), los botones de menú móvil y redes sociales tienen `aria-label`, y los componentes Radix (Switch, Dialog, Select, Tooltip) aportan semántica ARIA por defecto. Los hallazgos principales están en **controles personalizados del panel admin** y en la **navegación por teclado/estructura de encabezados**.

| Área | Estado |
|---|---|
| Imágenes (`alt`) | ✅ Correcto (público y admin) |
| Labels de formularios | ✅ Correcto (shadcn FormLabel) |
| Componentes Radix (Switch/Select/Dialog) | ✅ Correcto (ARIA nativo) |
| Botones icono-only del admin | ✅ Corregido (6 ago 2026): `aria-label` añadido |
| Toggles personalizados | ✅ Corregido (6 ago 2026): `role="switch"` / `aria-checked` |
| Encabezados / jerarquía H1-H2 | ✅ Corregido (6 ago 2026): títulos de tarjetas/secciones a `h2/h3`, `h2` sr-only donde no había encabezado visible |
| Skip link / salto de navegación | ✅ Corregido (6 ago 2026): "Saltar al contenido" en el layout principal |
| Contraste de color | ✅ Pasada de contraste en fondos claros (6 ago 2026): naranjas/amarillos/verdes a `*-700`, badges y estadísticas del admin incluidos. Falta medición automatizada (Lighthouse) |
| Navegación por teclado | ✅ Corregido (6 ago 2026): `focus-visible:ring-2` en miniaturas de galería de `pet-detail.tsx`; componentes `ui/*` ya usan `focus-visible:ring-*` |

---

## Hallazgos

### 1. Botones icono-only sin nombre accesible (admin) 🟠
Botones de editar/eliminar en listas del panel admin que solo contienen un icono, sin `aria-label`:

- `pages/admin/users.tsx` — botones Edit2/Trash2 (`h-8 w-8 p-0`)
- `pages/admin/news.tsx`, `allies.tsx`, `campaign-detail.tsx`, etc. (mismo patrón de lista)

Un lector de pantalla anuncia "botón" sin contexto. **Corrección** (una línea por botón):

```tsx
<Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0" aria-label={`Editar ${item.name}`} ...>
```

### 2. Toggles personalizados sin semántica de switch 🟠
Los controles de tipo interruptor construidos a mano (`relative w-10 h-5 rounded-full` con un `<span>` que se desplaza) aparecen en `submit-pet.tsx`, `pet-detail.tsx` y `users.tsx`. No tienen `role="switch"` ni `aria-checked`, por lo que:

- No anuncian su estado (activado/desactivado).
- No son operables con flechas del teclado (solo Tab + Enter/Espacio, y solo si el foco es visible).

**Corrección:**

```tsx
<button
  type="button"
  role="switch"
  aria-checked={form.watch(key)}
  onClick={() => form.setValue(key, !form.watch(key))}
  ...
>
```

### 3. Sin skip link ni landmarks de salto 🟠
No hay un enlace "Saltar al contenido" al inicio de la página. Los usuarios de teclado/lector de pantalla deben tabular toda la navegación (Navbar/Footer) antes de llegar al contenido. **Corrección** en el layout principal:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 ...">
  Saltar al contenido
</a>
```

### 4. Jerarquía de encabezados irregular 🟠
Varias páginas saltan de H1 a H3 o usan `font-bold` en `<p>` donde debería haber `<h2>` (p.ej. tarjetas de campañas/mascotas en `home.tsx`, secciones de `campaign-detail.tsx`). Para lectores de pantalla, la navegación por encabezados pierde estructura. **Revisar** con axe y sustituir los `<p className="font-bold">` de títulos por `<h2>/<h3>` reales.

### 5. Focus visible 🟡
Tailwind y shadcn suelen remover el `outline` por defecto y confiar en `ring-*`. Hay que verificar que los controles personalizados (toggles, tarjetas con `onClick`) muestren un anillo de foco claro. Revisar `focus-visible:ring-2` en los componentes `ui/*` y los botones custom de `submit-pet.tsx`/`pet-detail.tsx`.

### 6. Contraste y escalado ⚪ (pendiente)
- **Contraste:** los colores pastel (`bg-secondary/30`, `text-muted-foreground`, badges `bg-amber-50 text-amber-800`) pueden no alcanzar WCAG AA (4.5:1) para texto pequeño. Medir con Lighthouse/axe.
- **Escalado:** con zoom al 200% o `font-size` del navegador, verificar que los grids de 2-3 columnas no corten texto.

---

## Recomendaciones priorizadas

1. ✅ **Corregido (6 ago 2026):** `aria-label` en botones icono-only del admin (`users.tsx`, `news.tsx`, `allies.tsx`, `faq.tsx`) y `role="switch"`/`aria-checked` en toggles (`users.tsx`, `submit-pet.tsx`, `pet-detail.tsx`).
2. ✅ **Corregido (6 ago 2026):** skip link "Saltar al contenido" en el layout principal + `id="main-content"`.
3. ✅ **Corregido (6 ago 2026):** jerarquía de encabezados en `home.tsx`, `how-to-help.tsx`, `volunteer.tsx` y `campaign-detail.tsx` (títulos de tarjetas/secciones a `h2/h3` reales; `h2` sr-only donde la sección no tenía encabezado visible) + `focus-visible:ring-2` en las miniaturas de galería de `pet-detail.tsx`.
4. ✅ **Pasada de contraste (6 ago 2026):** textos naranja/amarillo/verde sobre fondos claros subidos a `*-700` en `home.tsx`, `how-to-help.tsx`, `Navbar.tsx`, `campaign-detail.tsx`, `campaign-transparency.tsx`, `pet-detail.tsx` y estadísticas de `admin/donations.tsx`, `admin/volunteers.tsx`, `admin/layout.tsx`. Pendiente medición automatizada.
5. **Con navegador disponible:** correr Lighthouse (Performance/A11y/SEO) y axe sobre las 5 páginas clave (home, campañas, adopciones, donación, panel admin), y medir contraste (6).

---

## Cómo ejecutar la auditoría automatizada

En un entorno con Chrome (CI o máquina local):

```bash
# Lighthouse (Requiere el sitio levantado en producción o preview)
npx lighthouse https://redsolidariasanramon.org --preset=desktop --output=html --output-path=./lighthouse.html

# axe-core como test automatizado (npm i -D @axe-core/playwright)
# Ver docs: https://github.com/dequelabs/axe-core-matrix
```

Ambos generan reportes accionables y complementan esta revisión estática.
