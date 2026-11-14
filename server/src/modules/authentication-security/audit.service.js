
import { AuditLog } from './models/AuditLog.js';

/**
 * Record a security event without storing sensitive request data.
 *
 * Audit logging is best-effort: a logging failure must not
 * interrupt the main application operation.
 */
export async function recordSecurityEvent({
  eventType,
  userId = null,
  outcome,
  ipAddress = null,
}) {
  try {
    await AuditLog.create({
      eventType,
      userId,
      outcome,
      ipAddress,
    });

    return true;
  } catch (error) {
    console.error(
      '[SECURITY AUDIT] Failed to record event:',
      eventType,
      error?.name || 'UnknownError',
    );

    return false;
  }
}

/**
 * Extract limited, non-sensitive context from an Express request.
 */
export function getAuditContext(request) {
  return {
    ipAddress: request.ip || null,
  };
}
