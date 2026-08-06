import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // Ahora almacena hash bcrypt
  role: text("role").notNull().default("moderador"),
  name: text("name").notNull(),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  passwordChangedAt: timestamp("password_changed_at"),
  // 2FA (TOTP): el secreto se genera vía /admin/2fa/setup y se activa con un
  // código de verificación. Nunca se expone en las respuestas del API.
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
});

// El schema de inserción ahora acepta password sin validar longitud mínima (se valida en el servicio)
// twoFactorSecret/twoFactorEnabled se gestionan solo vía /admin/2fa/* (anti mass-assignment)
export const insertAdminUserSchema = createInsertSchema(adminUsersTable)
  .omit({ id: true, createdAt: true, lastLoginAt: true, passwordChangedAt: true, twoFactorSecret: true, twoFactorEnabled: true })
  .extend({
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  });

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;
