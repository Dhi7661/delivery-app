/**
 * Security & Privacy Sanitization Helpers
 * In compliance with DPDP Act 2023 and Spec Section 12:
 * "Logs never contain full phone numbers, OTPs, or addresses. Mask them."
 */

/**
 * Masks an Indian or international phone number.
 * Example: "9822114455" -> "98*** **455", "+919822114455" -> "+91 98*** **455"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.length < 6) return '***';
  
  const start = cleaned.slice(0, 2);
  const end = cleaned.slice(-3);
  return `${start}*** **${end}`;
}

/**
 * Masks an address line or object.
 * Example: "Flat 402, Sunshine Apts, Kothrud, Pune - 411038" -> "Flat ***, Kothrud, Pune - 411038"
 */
export function maskAddress(address: any): string {
  if (!address) return '';
  if (typeof address === 'string') {
    const parts = address.split(',');
    if (parts.length <= 1) return '***';
    const first = parts[0].trim().slice(0, 4) + '***';
    const last = parts.slice(1).join(',').trim();
    return `${first}, ${last}`;
  }
  
  if (typeof address === 'object') {
    const line1 = address.line1 ? `${String(address.line1).slice(0, 4)}***` : '***';
    const city = address.city || address.area || '';
    const pincode = address.pincode || '';
    return [line1, city, pincode].filter(Boolean).join(', ');
  }
  
  return '***';
}

/**
 * Recursively sanitizes any payload or object before writing to AuditLog or console.
 * Strips or masks passwords, tokens, full phone numbers, OTPs, and addresses.
 */
export function sanitizeForLogging(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLogging);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Sensitive secrets to completely redact
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey === 'otp' ||
      lowerKey === 'otp_hash'
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey.includes('phone') && typeof value === 'string') {
      sanitized[key] = maskPhone(value);
    } else if (lowerKey.includes('address') && (typeof value === 'string' || typeof value === 'object')) {
      sanitized[key] = maskAddress(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

