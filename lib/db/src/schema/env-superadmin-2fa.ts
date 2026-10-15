import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * 2FA (TOTP) del superadministrador de respaldo por variables de entorno
 * (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), migración 028.
 *
 * POR QUÉ UNA TABLA PROPIA Y NO LA TABLA `settings`
 * -------------------------------------------------
 * El secreto TOTP NO puede vivir en `settings`: `GET /api/admin/settings`
 * devuelve TODAS las claves y el panel las pinta en pantalla, y
 * `PUT /api/admin/settings/:key` permite sobrescribir cualquier clave. Guardarlo
 * ahí expondría el segundo factor a cualquiera con una sesión de superadmin (y lo
 * mostraría en el navegador). Con una tabla propia, el secreto es **inalcanzable
 * por construcción** desde los endpoints genéricos de configuración: no hay
 * ningún camino que lo devuelva.
 *
 * Es una tabla de UNA sola fila: el `CHECK (id = 1)` lo garantiza en la base, así
 * que no puede haber dos secretos en conflicto.
 *
 * Se guarda en claro, igual que `admin_users.two_factor_secret`: es el mismo
 * diseño que ya usa la aplicación y no se inventa un esquema de cifrado para un
 * único secreto (el cifrado exigiría una clave de entorno que, si se pierde,
 * dejaría a todo el mundo fuera).
 */
export const envSuperadminTwoFactorTable = pgTable("env_superadmin_2fa", {
  id: integer("id").primaryKey().default(1),
  /** Secreto TOTP. NUNCA se devuelve en ninguna respuesta (salvo en el setup). */
  secret: text("secret"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EnvSuperadminTwoFactor = typeof envSuperadminTwoFactorTable.$inferSelect;
