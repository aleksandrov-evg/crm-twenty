import { isObject } from '@sniptt/guards';

const DATABASE_ERRORS: Record<string, string> = {
  ENOTFOUND:
    'PostgreSQL hostname could not be resolved; check Docker networks and database host.',
  EAI_AGAIN: 'PostgreSQL hostname lookup temporarily failed.',
  ECONNREFUSED:
    'PostgreSQL refused the connection; check host, port and listening address.',
  ETIMEDOUT:
    'PostgreSQL connection timed out; check network access and firewall.',
  EHOSTUNREACH: 'PostgreSQL host is unreachable from the container.',
  ENETUNREACH: 'PostgreSQL network is unreachable from the container.',
  '28P01':
    'PostgreSQL rejected the password; check credentials and URL password encoding.',
  '28000':
    'PostgreSQL rejected authorization; check pg_hba.conf and TLS requirements.',
  '3D000': 'The configured integration database does not exist.',
  '42501':
    'The database role lacks permissions for the integration schema or migrations.',
  '53300': 'PostgreSQL has no available connections.',
  ERR_INVALID_URL: 'CALENDAR_DATABASE_URL is not a valid URL.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'PostgreSQL TLS certificate is not trusted.',
  SELF_SIGNED_CERT_IN_CHAIN: 'PostgreSQL TLS certificate chain is not trusted.',
  CERT_HAS_EXPIRED: 'PostgreSQL TLS certificate has expired.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    'PostgreSQL TLS certificate chain cannot be verified.',
};
const CONFIGURATION_ERRORS: Record<string, string> = {
  CALENDAR_DATABASE_URL_REQUIRED:
    'CALENDAR_DATABASE_URL is required in the migrate container environment.',
  CALENDAR_DATABASE_URL_INVALID:
    'CALENDAR_DATABASE_URL must use postgres: or postgresql:.',
};

export const describeCalendarDatabaseError = (
  error: unknown,
): { code: string; hint: string } => {
  const inspect = (
    value: unknown,
    depth: number,
  ): { code: string; hint: string } | null => {
    if (depth > 4 || !isObject<Record<string, unknown>, unknown>(value))
      return null;
    if (
      typeof value.code === 'string' &&
      Object.hasOwn(DATABASE_ERRORS, value.code)
    )
      return { code: value.code, hint: DATABASE_ERRORS[value.code] };
    if (
      typeof value.message === 'string' &&
      Object.hasOwn(CONFIGURATION_ERRORS, value.message)
    )
      return { code: value.message, hint: CONFIGURATION_ERRORS[value.message] };
    for (const nested of [
      value.driverError,
      value.cause,
      ...(Array.isArray(value.errors) ? value.errors.slice(0, 10) : []),
    ]) {
      const result = inspect(nested, depth + 1);
      if (result) return result;
    }
    return null;
  };
  // Driver messages, SQL and URLs can contain credentials or business data.
  return (
    inspect(error, 0) ?? {
      code: 'DATABASE_ERROR_UNCLASSIFIED',
      hint: 'Database migration failed; inspect PostgreSQL server logs for the matching attempt.',
    }
  );
};
