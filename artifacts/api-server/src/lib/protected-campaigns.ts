import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  PROTECTED_CAMPAIGNS_SETTING_KEY,
  parseProtectedCampaignIds,
} from "./demo-classification";

/**
 * Campañas PROTEGIDAS frente a purgas (ChocoFest 2025/2026) — V9.1.
 *
 * La protección se resuelve UNA vez contra la base (por título, para obtener los
 * IDs REALES) y se guarda como lista de IDs en `settings`. A partir de ahí:
 *
 *   · es por ID, no por nombre → renombrar una campaña no la desprotege, y una
 *     campaña nueva que se llame «Chocofest» no queda protegida por accidente;
 *   · la consultan las purgas ANTES de tocar nada, así que no depende de que la
 *     interfaz se acuerde de comprobarlo.
 *
 * Vive en su propio módulo (y no en `lib/demo-classification.ts`) porque aquel es
 * PURO y este habla con la base.
 */

/** IDs de campaña protegidos. Lista vacía = nada protegido (estado inicial). */
export async function readProtectedCampaignIds(): Promise<number[]> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, PROTECTED_CAMPAIGNS_SETTING_KEY));
  return parseProtectedCampaignIds(row?.value ?? null);
}

/** Guarda la lista completa de IDs protegidos. */
export async function writeProtectedCampaignIds(ids: readonly number[]): Promise<void> {
  const value = [...ids].join(",");
  await db
    .insert(settings)
    .values({
      key: PROTECTED_CAMPAIGNS_SETTING_KEY,
      value,
      label: "Campañas protegidas frente a purgas (ChocoFest)",
      group: "mantenimiento",
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

/** ¿Está protegida esta campaña? Lo consultan las purgas antes de actuar. */
export async function isCampaignProtected(campaignId: number): Promise<boolean> {
  return (await readProtectedCampaignIds()).includes(campaignId);
}
