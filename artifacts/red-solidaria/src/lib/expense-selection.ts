/**
 * Selección de gastos para clasificar y eliminar (V12) — FUNCIONES PURAS.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * El error que corrige V12 fue de lógica de selección: el checkbox estaba
 * deshabilitado para los gastos no eliminables, y justo esos (los pendientes de
 * clasificar, huérfanos incluidos) son los que hay que SELECCIONAR para poder
 * clasificarlos. Un catch-22.
 *
 * La regla, explícita y probable aquí:
 *
 *   · SELECCIONAR no autoriza nada: sirve para revisar y clasificar, así que
 *     cualquier gasto visible se puede seleccionar.
 *   · ELIMINAR solo se habilita cuando TODOS los seleccionados son eliminables
 *     según el diagnóstico vigente del servidor.
 *
 * Es puro para poder probar las mezclas (eliminables + protegidos) sin navegador.
 */

export interface SelectableExpenseRow {
  id: number;
  deletable: boolean;
  actionLabel: string;
}

/** Estado del checkbox general respecto a los gastos VISIBLES (filtros activos). */
export type SelectionState = "none" | "some" | "all";

export function selectionState(
  selectedIds: readonly number[],
  visibleIds: readonly number[],
): SelectionState {
  if (visibleIds.length === 0) return "none";
  const selectedVisible = visibleIds.filter((id) => selectedIds.includes(id));
  if (selectedVisible.length === 0) return "none";
  return selectedVisible.length === visibleIds.length ? "all" : "some";
}

/** Marca/desmarca UN gasto (la selección se guarda sin duplicados). */
export function toggleSelection(selectedIds: readonly number[], id: number): number[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((value) => value !== id)
    : [...selectedIds, id];
}

/**
 * Selección masiva de los VISIBLES (respeta los filtros activos). Al desmarcar se
 * quitan solo los visibles: lo seleccionado fuera del filtro se conserva.
 */
export function selectVisible(
  selectedIds: readonly number[],
  visibleIds: readonly number[],
  checked: boolean,
): number[] {
  return checked
    ? [...new Set([...selectedIds, ...visibleIds])]
    : selectedIds.filter((id) => !visibleIds.includes(id));
}

export interface SelectionSummary {
  total: number;
  deletableIds: number[];
  /** Los que impiden la eliminación, con la acción que les corresponde. */
  blocked: { id: number; actionLabel: string }[];
  allDeletable: boolean;
  /** Clasificar está disponible con CUALQUIER selección (es lo que desbloquea). */
  canClassify: boolean;
  /** Eliminar exige que TODOS los seleccionados sean eliminables. */
  canDelete: boolean;
}

/** Resume la selección para decidir qué acciones ofrecer. Puro. */
export function summarizeSelection(
  rows: readonly SelectableExpenseRow[],
  selectedIds: readonly number[],
): SelectionSummary {
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  const deletableIds = selected.filter((row) => row.deletable).map((row) => row.id);
  const blocked = selected
    .filter((row) => !row.deletable)
    .map((row) => ({ id: row.id, actionLabel: row.actionLabel }));
  return {
    total: selected.length,
    deletableIds,
    blocked,
    allDeletable: selected.length > 0 && blocked.length === 0,
    canClassify: selected.length > 0,
    canDelete: selected.length > 0 && blocked.length === 0,
  };
}
