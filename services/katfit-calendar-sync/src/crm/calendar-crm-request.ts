import { readBoundedBody } from '../transport/read-bounded-body';

export type CalendarCrmConfiguration = {
  baseUrl: string;
  apiToken: string;
  allowInsecureHttp?: boolean;
  fetch?: typeof fetch;
};

export const createCalendarCrmBaseUrl = (
  configuration: CalendarCrmConfiguration,
): URL => {
  const baseUrl = new URL(configuration.baseUrl);
  if (
    (baseUrl.protocol !== 'https:' &&
      !(
        baseUrl.protocol === 'http:' && configuration.allowInsecureHttp === true
      )) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.pathname !== '/' ||
    !configuration.apiToken.trim() ||
    /[\r\n]/.test(configuration.apiToken)
  )
    throw new Error('INVALID_CRM_CONFIGURATION');
  return baseUrl;
};

export const createCalendarCrmRequest = (
  configuration: CalendarCrmConfiguration,
) => {
  const baseUrl = createCalendarCrmBaseUrl(configuration);
  const request = configuration.fetch ?? fetch;
  return async (
    path: string,
    options: { method: 'GET' | 'POST'; body?: string },
  ): Promise<
    | { status: 'received'; httpStatus: number; body: unknown }
    | { status: 'unconfirmed' }
  > => {
    const url = new URL(path, baseUrl);
    if (
      url.origin !== baseUrl.origin ||
      !path.startsWith('/') ||
      path.startsWith('//')
    )
      throw new Error('INVALID_CRM_PATH');
    try {
      const response = await request(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${configuration.apiToken}`,
          Accept: 'application/json',
          ...(options.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
      });
      const buffer = await readBoundedBody(
        response.body,
        2 * 1024 * 1024,
        'CRM_RESPONSE_TOO_LARGE',
      );
      let body: unknown;
      try {
        body = JSON.parse(buffer?.toString('utf8') ?? '');
      } catch {
        body = null;
      }
      return { status: 'received', httpStatus: response.status, body };
    } catch {
      return { status: 'unconfirmed' };
    }
  };
};
