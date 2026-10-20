import { Router, type IRouter } from "express";
import { db, campaignLeftoversTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { toIsoSafe } from "../lib/date-format";
import { requireAdmin } from "../middleware/require-admin";
import { requireRole, ROLES } from "../middleware/roles";
import { adminActionLimiter } from "../middleware/rate-limit";

// Bienes e insumos de una campaña (Fase 2 del Prompt Maestro): raciones de
// chocolatada, juguetes/regalos, canastas de víveres y otros aportes en especie.
// Se reutiliza `campaign_leftovers`; no hay una tabla por producto.
//
// Solo administrador o superadmin para escribir.
const adminOnly = [requireAdmin, requireRole(ROLES.ADMIN)];

const router: IRouter = Router();

const MAX_TEXT = 300;
const MAX_ITEM = 120;
const MAX_CATEGORY = 40;

interface ItemPayload {
  item: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  isPublic: boolean;
  category: string | null;
  targetQty: number | null;
  receivedQty: number | null;
  usedQty: number | null;
  /** Composición de la canasta: una línea por producto ("arroz | 2 kg"). */
  composition: string | null;
  /** Donante del bien (opcional; sin FK estricta, ver migración 017). */
  donorId: number | null;
  /** Evidencia de entrega asociada (opcional). */
  evidenceId: number | null;
}

type ParseResult =
  | { ok: true; data: ItemPayload }
  | { ok: false; message: string };

function optionalText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Cantidad opcional: acepta número, cadena numérica, null o vacío.
 * Devuelve `"invalid"` si no es un número finito no negativo.
 */
function optionalQty(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

/**
 * Valida el cuerpo de un bien. Devuelve un mensaje REAL y accionable en lugar
 * de un 400 genérico, para que el panel pueda explicarlo.
 *
 * Regla del saldo: si se registra el flujo (`receivedQty`), `quantity` pasa a
 * ser el SALDO (`recibido - usado`). Así cualquier lector que use `quantity`
 * —incluida la sección pública de inventario— sigue viendo el número correcto,
 * y la regla de presentación vive en la función pura `resolveStock` del
 * frontend (`src/lib/inventory.ts`).
 */
function parseItemPayload(body: unknown, campaignId: number): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;

  const item = optionalText(raw.item, MAX_ITEM);
  if (!item) {
    return { ok: false, message: "El nombre del bien es obligatorio." };
  }

  const quantityRaw = optionalQty(raw.quantity);
  if (quantityRaw === "invalid") {
    return { ok: false, message: "La cantidad disponible debe ser un número mayor o igual a 0." };
  }

  const targetQty = optionalQty(raw.targetQty);
  if (targetQty === "invalid") {
    return { ok: false, message: "La meta debe ser un número mayor o igual a 0." };
  }
  const receivedQty = optionalQty(raw.receivedQty);
  if (receivedQty === "invalid") {
    return { ok: false, message: "La cantidad recibida debe ser un número mayor o igual a 0." };
  }
  const usedQty = optionalQty(raw.usedQty);
  if (usedQty === "invalid") {
    return { ok: false, message: "La cantidad usada debe ser un número mayor o igual a 0." };
  }
  if (receivedQty !== null && usedQty !== null && usedQty > receivedQty) {
    return {
      ok: false,
      message: `La cantidad usada (${usedQty}) no puede superar la recibida (${receivedQty}).`,
    };
  }

  const hasFlow = receivedQty !== null;
  const quantity = hasFlow
    ? Math.max(0, receivedQty - (usedQty ?? 0))
    : (quantityRaw ?? 1);

  return {
    ok: true,
    data: {
      item,
      quantity,
      unit: optionalText(raw.unit, 40),
      notes: optionalText(raw.notes),
      isPublic: raw.isPublic === undefined ? true : Boolean(raw.isPublic),
      category: optionalText(raw.category, MAX_CATEGORY),
      targetQty,
      receivedQty,
      usedQty,
      // Composición de la canasta: texto libre acotado (una línea por producto).
      composition: optionalText(raw.composition, 600),
      // Vínculos opcionales: cualquier valor que no sea un entero positivo se
      // guarda como null en lugar de romper el alta del bien.
      donorId:
        typeof raw.donorId === "number" &&
        Number.isInteger(raw.donorId) &&
        raw.donorId > 0
          ? raw.donorId
          : null,
      evidenceId:
        typeof raw.evidenceId === "number" &&
        Number.isInteger(raw.evidenceId) &&
        raw.evidenceId > 0
          ? raw.evidenceId
          : null,
    },
  };
}

// Público: SOLO bienes publicados (is_public=true). El filtro va en SQL para que
// las filas privadas NUNCA salgan por este endpoint anónimo (mismo patrón que
// /campaigns/:id/evidence).
router.get("/campaigns/:id/leftovers", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const leftovers = await db
      .select()
      .from(campaignLeftoversTable)
      .where(
        and(
          eq(campaignLeftoversTable.campaignId, campaignId),
          eq(campaignLeftoversTable.isPublic, true),
        ),
      )
      .orderBy(desc(campaignLeftoversTable.createdAt));
    res.json(leftovers.map(formatPublicLeftover));
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign leftovers");
    res.status(500).json({ error: "server_error", message: "Failed to get leftovers" });
  }
});

// Admin: TODOS los bienes (públicos y privados) para gestión interna.
// Protegido por el gate global /admin/* (index.ts) y por adminOnly.
router.get(
  "/admin/campaigns/:id/leftovers",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const leftovers = await db
        .select()
        .from(campaignLeftoversTable)
        .where(eq(campaignLeftoversTable.campaignId, campaignId))
        .orderBy(desc(campaignLeftoversTable.createdAt));
      res.json(leftovers.map(formatLeftover));
    } catch (err) {
      req.log.error({ err }, "Failed to get campaign leftovers (admin)");
      res.status(500).json({ error: "server_error", message: "Failed to get leftovers" });
    }
  },
);

router.post(
  "/campaigns/:id/leftovers",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    const parsed = parseItemPayload(req.body, campaignId);
    if (!parsed.ok) {
      return res.status(400).json({ error: "validation_error", message: parsed.message });
    }
    try {
      const [leftover] = await db
        .insert(campaignLeftoversTable)
        .values({ ...parsed.data, campaignId })
        .returning();
      return res.status(201).json(formatLeftover(leftover));
    } catch (err) {
      req.log.error({ err }, "Failed to create campaign leftover");
      return res.status(500).json({ error: "server_error", message: "No se pudo guardar el bien." });
    }
  },
);

router.put(
  "/campaigns/:id/leftovers/:leftoverId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    const campaignId = Number(req.params.id);
    const leftoverId = Number(req.params.leftoverId);
    try {
      // PUT con MERGE: se parte de la fila guardada, así el panel puede cambiar
      // un solo campo (p. ej. la visibilidad) sin borrar el resto. Antes exigía
      // el objeto completo y un cambio parcial fallaba con 400.
      const [existing] = await db
        .select()
        .from(campaignLeftoversTable)
        .where(
          and(
            eq(campaignLeftoversTable.id, leftoverId),
            eq(campaignLeftoversTable.campaignId, campaignId),
          ),
        );
      if (!existing) {
        return res.status(404).json({ error: "not_found", message: "Bien no encontrado" });
      }
      const parsed = parseItemPayload({ ...existing, ...(req.body ?? {}) }, campaignId);
      if (!parsed.ok) {
        return res.status(400).json({ error: "validation_error", message: parsed.message });
      }
      const [leftover] = await db
        .update(campaignLeftoversTable)
        .set(parsed.data)
        .where(
          and(
            eq(campaignLeftoversTable.id, leftoverId),
            eq(campaignLeftoversTable.campaignId, campaignId),
          ),
        )
        .returning();
      if (!leftover) {
        return res.status(404).json({ error: "not_found", message: "Bien no encontrado" });
      }
      return res.json(formatLeftover(leftover));
    } catch (err) {
      req.log.error({ err }, "Failed to update campaign leftover");
      return res.status(500).json({ error: "server_error", message: "No se pudo actualizar el bien." });
    }
  },
);

router.delete(
  "/campaigns/:id/leftovers/:leftoverId",
  ...adminOnly,
  adminActionLimiter,
  async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const leftoverId = Number(req.params.leftoverId);
      await db
        .delete(campaignLeftoversTable)
        .where(
          and(
            eq(campaignLeftoversTable.id, leftoverId),
            eq(campaignLeftoversTable.campaignId, campaignId),
          ),
        );
      res.status(204).send();
    } catch (err) {
      req.log.error({ err }, "Failed to delete campaign leftover");
      res.status(500).json({ error: "server_error", message: "Failed to delete leftover" });
    }
  },
);

export function formatLeftover(e: typeof campaignLeftoversTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    item: e.item,
    quantity: e.quantity,
    unit: e.unit,
    notes: e.notes,
    isPublic: e.isPublic,
    // Migración 015: clasificación, meta y flujo recibido/usado.
    category: e.category,
    targetQty: e.targetQty,
    receivedQty: e.receivedQty,
    usedQty: e.usedQty,
    // Migración 017: composición de canastas y trazabilidad del bien.
    composition: e.composition,
    donorId: e.donorId,
    evidenceId: e.evidenceId,
    createdAt: toIsoSafe(e.createdAt),
  };
}

/**
 * DTO público de un bien. `donorId` y `evidenceId` son claves internas que
 * permiten enlazar el bien con la ficha de una persona o una prueba privada;
 * no aportan nada a la web y no deben salir por el endpoint anónimo.
 */
export function formatPublicLeftover(e: typeof campaignLeftoversTable.$inferSelect) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    item: e.item,
    quantity: e.quantity,
    unit: e.unit,
    notes: e.notes,
    category: e.category,
    targetQty: e.targetQty,
    receivedQty: e.receivedQty,
    usedQty: e.usedQty,
    composition: e.composition,
    createdAt: toIsoSafe(e.createdAt),
  };
}

export default router;
