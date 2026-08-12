import { randomBytes } from "node:crypto";

/**
 * Genera una contraseña aleatoria de 24 caracteres base64url (~144 bits de
 * entropía). Se usa para las cuentas demo de desarrollo: no existen
 * credenciales por defecto, cada entorno genera las suyas al arrancar.
 */
export function generateRandomPassword(): string {
  return randomBytes(18).toString("base64url");
}
