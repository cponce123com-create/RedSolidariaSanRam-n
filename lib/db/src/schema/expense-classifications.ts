import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Clasificación MANUAL de un gasto (migración 029, V11).
 *
 * POR QUÉ EXISTE
 * --------------
 * Un gasto cuya campaña ya no existe (huérfano) no puede clasificarse solo: no hay
 * declaración DEMO que lo respalde. En la base de producción estos huérfanos son
 * REALES y esperados, porque la clave ajena de `campaign_expenses.campaign_id` se
 * añadió con `NOT VALID` (migración 025): PostgreSQL no revisó las filas que ya
 * existían, así que hay gastos que apuntan a campañas desaparecidas. Sin una
 * declaración explícita del superadmin, esos gastos quedaban bloqueados para
 * siempre.
 *
 * Esta tabla guarda esa declaración: qué es cada gasto (DEMO, real o pendiente),
 * con qué motivo, con qué evidencia, quién lo dijo y cuándo.
 *
 * SIN CLAVE FORÁNEA A `campaign_expenses` A PROPÓSITO
 * --------------------------------------------------
 * La clasificación debe SOBREVIVIR al borrado del gasto: es la prueba de por qué se
 * destruyó. Si tuviera FK, la propia purga se llevaría el rastro.
 *
 * Una sola fila por gasto (`UNIQUE (expense_id)`): la última declaración manda, y
 * cada cambio queda además en `audit_logs`.
 */
export const expenseClassificationsTable = pgTable("expense_classifications", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull().unique(),
  /** `demo` | `real` | `pending` (validado además por un CHECK en la base). */
  classification: text("classification").notNull(),
  /** Motivo obligatorio: sin él no se acepta la clasificación. */
  reason: text("reason").notNull(),
  /** Referencia documental opcional (nº de boleta, enlace, nota). */
  evidence: text("evidence"),
  classifiedBy: text("classified_by"),
  classifiedById: text("classified_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ExpenseClassification = typeof expenseClassificationsTable.$inferSelect;
