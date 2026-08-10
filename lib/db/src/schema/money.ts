import { customType } from "drizzle-orm/pg-core";

/**
 * Tipo money: numeric(12,2) con conversión automática a number en JS.
 *
 * Sustituye a `real` (float4) para montos: float4 introduce errores de
 * redondeo acumulados en SUM/agregaciones (100.10 → 100.099998...). Con
 * numeric, la DB almacena decimales exactos y pg devuelve el valor como
 * string; este tipo lo convierte a number en la frontera (fromDriver), de
 * modo que TODO el código existente sigue trabajando con numbers sin cambios.
 *
 * - toDriver: number → "1234.56" (2 decimales, escala fija)
 * - fromDriver: "1234.56" → 1234.56
 *
 * Compatible con el ledger hash-chained (lib/ledger.ts): los hashes se
 * calculan con `amount.toFixed(2)` del valor leído; numeric devuelve el mismo
 * valor exacto → mismo hash que con la representación canónica anterior.
 */
export const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(12,2)";
  },
  toDriver(value: number): string {
    return value.toFixed(2);
  },
  fromDriver(value: string): number {
    return Number(value);
  },
});
