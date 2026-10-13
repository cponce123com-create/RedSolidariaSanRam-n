# ⚠️ Sandbox de diseño — NO es producto

Esta carpeta (`artifacts/mockup-sandbox/src/components/ui/`) es una **copia de trabajo** de la librería de
componentes que usa **exclusivamente** el sandbox de diseño (`artifacts/mockup-sandbox`).

- **La copia de producto es** `artifacts/red-solidaria/src/components/ui/`.
  Editar aquí **no** cambia la aplicación.
- El sandbox **no forma parte del build ni del typecheck** del monorepo
  (`package.json` del root filtra `api-server`, `red-solidaria`, `lib/**` y `scripts` — hallazgo INF-04).
- **Ya existe drift:** al 2026-10, 7 archivos difieren de la copia de producto
  (`badge`, `button`, `chart`, `dialog`, `input-group`, `sidebar`, `skeleton`). No asumas paridad.
- Si un componente se promueve a producto, cópialo **hacia** `red-solidaria` de forma consciente y revisa
  que el tema/tokens coincidan.

Ver `docs/AUDITORIA_INTEGRAL_2026.md` (FE-07) y `docs/ARQUITECTURA_ACTUALIZADA.md`.
