import bcrypt from "bcryptjs";
import { db, auditLogsTable } from "@workspace/db";

// Augmentación de tipos para la sesión de admin (express-session)
declare module "express-session" {
  interface SessionData {
    adminUser?:
      | {
          id: number;
          username: string;
          name: string | null;
          role: string;
        }
      | null;
  }
}

const SALT_ROUNDS = 12;

/**
 * Hashea una contraseña usando bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifica si una contraseña coincide con su hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Registra una acción en el audit log
 */
export async function logAuditAction(params: {
  userId?: number | null;
  username?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any> | null;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: params.userId?.toString() || null,
      username: params.username || null,
      action: params.action,
      resource: params.resource || null,
      resourceId: params.resourceId || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      details: params.details || null,
    });
  } catch (error) {
    // No fallar la operación principal si el audit log falla
    console.error("Error writing audit log:", error);
  }
}

/**
 * Middleware factory para logging de auditoría en rutas Express
 */
export function createAuditLogger(action: string, resource: string) {
  return async (req: any, res: any, next: any) => {
    const originalSend = res.send;
    const startTime = Date.now();
    
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      const adminUser = req.session?.adminUser;
      
      // Determinar si la acción fue exitosa
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      
      // Preparar detalles
      const details = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        requestBody: req.body ? sanitizeBody(req.body) : undefined,
        success: isSuccess,
      };
      
      // Registrar en audit log (sin esperar)
      logAuditAction({
        userId: adminUser?.id || null,
        username: adminUser?.username || null,
        action,
        resource,
        resourceId: req.params?.id?.toString() || null,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.get("user-agent") || null,
        details,
      }).catch(console.error);
      
      res.send = originalSend;
      return res.send.call(this, body);
    };
    
    next();
  };
}

/**
 * Sanitiza el cuerpo de la petición para no guardar datos sensibles
 */
function sanitizeBody(body: any): Record<string, any> {
  if (!body || typeof body !== "object") return body;
  
  const sanitized: Record<string, any> = {};
  const sensitiveFields = ["password", "token", "secret", "creditCard", "cvv"];
  
  for (const [key, value] of Object.entries(body)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}
