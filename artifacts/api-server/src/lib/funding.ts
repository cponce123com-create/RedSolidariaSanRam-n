import { toSafeAmount } from "./amount-format";

/**
 * Conciliación de la recaudación de una campaña (Prompt Maestro V7, Fase 3.1).
 *
 * Hasta ahora el sitio publicaba `max(columna manual, suma de donaciones)`: dos
 * cifras de naturaleza distinta mezcladas sin criterio, así que un importe
 * histórico podía tapar las donaciones reales (o al revés) sin que nadie
 * pudiera conciliar el resultado. Aquí la regla es explícita y auditable:
 *
 *   - `verifiedRaised`    → suma de donaciones confirmadas (aprobadas +
 *                           conciliadas). Es la fuente verificable.
 *   - `historicalRaised`  → importe histórico registrado a mano en la campaña
 *                           (importaciones anteriores a la plataforma).
 *   - `historicalCounted` → `true` solo cuando NO hay donaciones registradas:
 *                           entonces el importe histórico es la única fuente y
 *                           cuenta. Si hay donaciones, el histórico se publica
 *                           como referencia y NO se suma, porque sumarlo
 *                           duplicaría importes ya registrados (los datos
 *                           históricos cargados por seed traen ambas cosas).
 *   - `reconciledRaised`  → total conciliado: verificado + histórico contado.
 *
 * Nunca se usa el máximo de dos cantidades: la cifra publicada es siempre la
 * suma de fuentes que NO se solapan.
 */
export interface CampaignFunding {
  verifiedRaised: number;
  historicalRaised: number;
  historicalCounted: boolean;
  reconciledRaised: number;
}

/** Redondeo a céntimos: los importes son `numeric(12,2)` y sumar floats deriva. */
export function roundMoney(value: unknown): number {
  return Math.round(toSafeAmount(value) * 100) / 100;
}

export function campaignFunding(
  historical: unknown,
  verified: unknown,
): CampaignFunding {
  const historicalRaised = Math.max(0, roundMoney(historical));
  const verifiedRaised = Math.max(0, roundMoney(verified));
  const historicalCounted = verifiedRaised === 0 && historicalRaised > 0;

  return {
    verifiedRaised,
    historicalRaised,
    historicalCounted,
    reconciledRaised: roundMoney(
      verifiedRaised + (historicalCounted ? historicalRaised : 0),
    ),
  };
}

/**
 * Saldo disponible conciliado: ingresos conciliados menos egresos válidos.
 * Se deriva siempre (nunca se guarda) para que no pueda desincronizarse.
 */
export function availableBalance(funding: CampaignFunding, spent: unknown): number {
  return roundMoney(funding.reconciledRaised - Math.max(0, roundMoney(spent)));
}
