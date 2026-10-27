import { isObject } from '@sniptt/guards';

const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'ABORT_ERR',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

export const describeCalendarNetworkError = (error: unknown): string => {
  const inspect = (value: unknown, depth: number): string | null => {
    if (depth > 4 || !isObject<Record<string, unknown>, unknown>(value)) return null;
    if (typeof value.code === 'string' && NETWORK_CODES.has(value.code)) return value.code;
    if (value.name === 'TimeoutError') return 'ETIMEDOUT';
    if (value.name === 'AbortError') return 'ABORT_ERR';
    for (const nested of [value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 10) : [])]) {
      const result = inspect(nested, depth + 1);
      if (result) return result;
    }
    return null;
  };
  return inspect(error, 0) ?? 'CALDAV_NETWORK_UNCLASSIFIED';
};
