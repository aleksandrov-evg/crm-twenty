import { Agent } from 'undici';

import { readBoundedBody } from './read-bounded-body';

import { createYandexCalDavLookup } from './yandex-caldav-lookup';
import { isYandexCalDavTarget } from './yandex-caldav-target';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const ALLOWED_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'PROPFIND',
  'REPORT',
  'PUT',
  'DELETE',
]);

export type YandexCalDavTransport = {
  fetch: typeof globalThis.fetch;
  close: () => Promise<void>;
};

export const createYandexCalDavTransport = ({
  username,
  appPassword,
}: {
  username: string;
  appPassword: string;
}): YandexCalDavTransport => {
  if (
    !username.trim() ||
    !appPassword ||
    /[:\r\n]/.test(username) ||
    /[\r\n]/.test(appPassword)
  ) {
    throw new Error('CALDAV_CREDENTIALS_REQUIRED');
  }

  const authorization = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const dispatcher = new Agent({
    connect: {
      lookup: createYandexCalDavLookup(),
      timeout: REQUEST_TIMEOUT_MS,
    },
    headersTimeout: REQUEST_TIMEOUT_MS,
    bodyTimeout: REQUEST_TIMEOUT_MS,
    maxResponseSize: MAX_RESPONSE_BYTES,
    connections: 2,
  });

  return {
    close: () => dispatcher.close(),
    fetch: async (input, init) => {
      let request: Request;
      try {
        request = new Request(input, init);
      } catch {
        throw new Error('CALDAV_TARGET_REJECTED');
      }

      if (
        !isYandexCalDavTarget(request.url) ||
        !ALLOWED_METHODS.has(request.method)
      ) {
        throw new Error('CALDAV_TARGET_REJECTED');
      }

      const requestBody = await readBoundedBody(
        request.body,
        MAX_REQUEST_BYTES,
        'CALDAV_REQUEST_TOO_LARGE',
      );
      const body =
        requestBody === null ? undefined : requestBody.toString('utf8');

      const headers = new Headers(request.headers);

      headers.set('Authorization', authorization);
      headers.delete('Cookie');
      headers.delete('Host');
      headers.delete('Proxy-Authorization');
      headers.delete('Content-Length');
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]);
      signal.throwIfAborted();
      const options = {
        method: request.method,
        headers,
        body,
        redirect: 'manual' as const,
        signal,
        dispatcher,
      };
      const response = await globalThis.fetch(request.url, options);

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304
      ) {
        const location = response.headers.get('location');

        if (
          request.redirect === 'error' ||
          !location ||
          !isYandexCalDavTarget(new URL(location, request.url).href)
        ) {
          await response.body?.cancel();
          throw new Error('CALDAV_REDIRECT_REJECTED');
        }
      }

      const content = await readBoundedBody(
        response.body,
        MAX_RESPONSE_BYTES,
        'CALDAV_RESPONSE_TOO_LARGE',
      );

      if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(content?.toString('utf8') ?? '')) {
        throw new Error('CALDAV_XML_ENTITIES_REJECTED');
      }

      const responseHeaders = new Headers(response.headers);

      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');
      return new Response(content === null ? null : Uint8Array.from(content), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    },
  };
};
