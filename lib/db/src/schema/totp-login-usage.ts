import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Último paso TOTP consumido en un LOGIN de administrador.
 *
 * Un código TOTP es válido durante una ventana de ±1 paso (30 s). Sin este
 * registro, un código observado/interceptado podía reutilizarse durante esa
 * ventana para abrir otra sesión. La clave es la cuenta (`user:<id>` o
 * `env:0`, el superadmin de respaldo) y la actualización es atómica: solo se
 * acepta un paso ESTRICTAMENTE mayor que el último consumido.
 *
 * Se limita a los logins: setup, verificación y reautenticación pueden usar el
 * mismo código dentro de su ventana sin obligar al usuario a esperar 30 s.
 */
export const totpLoginUsageTable = pgTable("totp_login_usage", {
  accountKey: text("account_key").primaryKey(),
  lastStep: integer("last_step").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TotpLoginUsage = typeof totpLoginUsageTable.$inferSelect;
