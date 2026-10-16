import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Ítems de una donación en especie (V20 · Fase 9).
 *
 * Una donación de productos puede traer VARIOS productos (una caja de panetones,
 * 5 kg de arroz, 2 paquetes de leche). Antes no había dónde guardarlos: esta tabla
 * los modela uno a uno, con su cantidad, unidad y —cuando se reciben— la CANTIDAD
 * REALMENTE RECIBIDA, que es la que alimenta las cifras de productos (nunca la
 * prometida).
 *
 * `estimated_value` es un valor ORIENTATIVO declarado por el donante y se guarda
 * SEPARADO de los ingresos monetarios: NUNCA se suma al dinero recaudado (ese
 * total sale de `donations.amount` con estado contable confirmado).
 *
 * ADITIVA: tabla nueva; ninguna donación histórica se modifica.
 */
export const donationItemsTable = pgTable(
  "donation_items",
  {
    id: serial("id").primaryKey(),
    donationId: integer("donation_id").notNull(),
    /** Producto: valor del catálogo (p. ej. "panetones") o texto libre si es "otros". */
    product: text("product").notNull(),
    /** Cantidad comprometida. `numeric` llega como string desde pg. */
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    /** Unidad: caja | paquete | saco | unidad | kilogramo | litro. */
    unit: text("unit").notNull(),
    description: text("description"),
    /** Valor estimado OPCIONAL. Separado de los ingresos monetarios. */
    estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /** Fotografía del producto recibido (Cloudinary). */
    photoUrl: text("photo_url"),
    photoPublicId: text("photo_public_id"),
    /** Cantidad REALMENTE recibida (se fija al pasar a «recibida»). */
    receivedQuantity: numeric("received_quantity", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    donationIdx: index("idx_donation_items_donation").on(table.donationId),
  }),
);

export type DonationItemRow = typeof donationItemsTable.$inferSelect;
