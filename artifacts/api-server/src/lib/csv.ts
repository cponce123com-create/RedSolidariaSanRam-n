/**
 * Generación de CSV (Fase 4 del Prompt Maestro): informes descargables
 * compatibles con Excel y LibreOffice, SIN dependencias externas.
 *
 * Dos reglas:
 *  1. RFC 4180: comillas dobles para valores con separador, comillas o saltos.
 *  2. Anti-inyección de fórmulas: un valor que empieza por = + - @ (o tab/CR) se
 *     prefija con una comilla simple; si no, Excel lo evalúa como FÓRMULA al
 *     abrir el archivo (CSV injection: exfiltración de datos o ejecución de
 *     comandos desde un campo como el nombre del donante).
 *
 * Los caracteres de control se referencian por CÓDIGO numérico en vez de por
 * secuencias de escape: así el fuente no depende de caracteres invisibles.
 *
 * Funciones PURAS y testeables.
 */

export const CSV_BOM = String.fromCharCode(0xfeff);

/** Separador de campos: coma, el formato que Excel interpreta directamente. */
export const CSV_SEPARATOR = ",";

/** Fin de línea CR LF: el que Excel espera entre registros. */
export const CSV_LINE_BREAK = String.fromCharCode(13, 10);

/** Códigos que obligan a entrecomillar la celda: comilla, coma, CR, LF y ; */
const QUOTE_CODE = 34;
const NEEDS_QUOTING_CODES = [QUOTE_CODE, 44, 13, 10, 59];

/** Códigos que disparan una fórmula si abren la celda: = + - @ TAB CR */
const FORMULA_TRIGGER_CODES = [61, 43, 45, 64, 9, 13];

/** ¿El valor debe neutralizarse por posible inyección de fórmulas? */
export function isFormulaInjection(value: string): boolean {
  if (!value) return false;
  return FORMULA_TRIGGER_CODES.includes(value.charCodeAt(0));
}

function needsQuoting(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (NEEDS_QUOTING_CODES.includes(value.charCodeAt(i))) return true;
  }
  return false;
}

/**
 * Convierte un valor a una celda CSV segura:
 *  - null/undefined → cadena vacía
 *  - números y booleanos → texto plano (nunca disparan fórmulas)
 *  - cadenas con = + - @ inicial → prefijadas con ' (Excel lo trata como texto)
 *  - cadenas con , " ; o saltos de línea → entrecomilladas (comillas duplicadas)
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  const text = typeof value === "string" ? value : String(value);
  const safe = isFormulaInjection(text) ? `'${text}` : text;
  if (!needsQuoting(safe)) return safe;
  const doubled = safe.split(String.fromCharCode(QUOTE_CODE)).join(
    String.fromCharCode(QUOTE_CODE, QUOTE_CODE),
  );
  const q = String.fromCharCode(QUOTE_CODE);
  return q + doubled + q;
}

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => unknown;
}

/** Construye el CSV (encabezado + filas) con fin de línea CRLF (Excel). */
export function toCsv<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(CSV_SEPARATOR);
  const body = rows.map((row) =>
    columns.map((c) => escapeCsvValue(c.value(row))).join(CSV_SEPARATOR),
  );
  return [header, ...body].join(CSV_LINE_BREAK);
}

/** Documento CSV completo, con BOM para que Excel respete los acentos. */
export function toCsvDocument<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
): string {
  return CSV_BOM + toCsv(columns, rows);
}

/** Nombre de archivo con la fecha del día: `prefijo-AAAA-MM-DD.csv`. */
export function csvFilename(prefix: string, date: Date = new Date()): string {
  const iso = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
