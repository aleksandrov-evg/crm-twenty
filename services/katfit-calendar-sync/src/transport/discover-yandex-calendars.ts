import { isString } from '@sniptt/guards';
import { DAVClient } from 'tsdav';
import { xml2js } from 'xml-js';
import { z } from 'zod';

import { createYandexAuthorizationObserver } from '../observability/yandex-authorization-observer';

import { createYandexCalDavTransport } from './create-yandex-caldav-transport';
import {
  isYandexCalDavTarget,
  YANDEX_CALDAV_ORIGIN,
} from './yandex-caldav-target';

export type DiscoveredYandexCalendar = {
  url: string;
  displayName: string;
  reports: string[];
  writeAccess: 'unverified';
};

export type YandexCalendarDiscoveryResult =
  | { status: 'discovered'; calendars: DiscoveredYandexCalendar[] }
  | {
      status:
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'discovery-failed';
    };

const discoverCalendars = async (credentials: {
  username: string;
  appPassword: string;
}): Promise<YandexCalendarDiscoveryResult> => {
  let transport: ReturnType<typeof createYandexCalDavTransport>;

  try {
    transport = createYandexCalDavTransport(credentials);
  } catch {
    return { status: 'auth-required' };
  }

  let lastFailure: number | undefined;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await transport.fetch(input, init);

    if (response.status >= 400) lastFailure = response.status;

    // tsdav can fall back to an empty property set after XML parsing fails.
    if (response.status === 207) {
      if (
        !response.headers.get('content-type')?.toLowerCase().includes('xml')
      ) {
        throw new Error('CALDAV_MULTISTATUS_INVALID');
      }
      const parsed: unknown = xml2js(await response.clone().text(), {
        compact: true,
        ignoreDeclaration: true,
        elementNameFn: (name) => name.replace(/^.*:/, ''),
      });
      if (
        !z
          .object({ multistatus: z.object({}).passthrough() })
          .passthrough()
          .safeParse(parsed).success
      ) {
        throw new Error('CALDAV_MULTISTATUS_INVALID');
      }
    }
    return response;
  };

  try {
    const client = new DAVClient({
      serverUrl: YANDEX_CALDAV_ORIGIN,
      credentials: {},
      authMethod: 'Custom',
      authFunction: async () => ({}),
      defaultAccountType: 'caldav',
      fetch,
    });

    await client.login();
    const calendars = await client.fetchCalendars();

    if (
      calendars.length > 100 ||
      calendars.some((calendar) => !isYandexCalDavTarget(calendar.url))
    ) {
      return { status: 'discovery-failed' };
    }

    return {
      status: 'discovered',
      calendars: calendars
        .filter(
          (calendar) =>
            !calendar.components?.length ||
            calendar.components.includes('VEVENT'),
        )
        .map((calendar) => {
          const reports: unknown = calendar.reports;

          return {
            url: calendar.url,
            displayName: isString(calendar.displayName)
              ? calendar.displayName
              : '',
            reports: Array.isArray(reports)
              ? reports.filter((report: unknown): report is string =>
                  isString(report),
                )
              : [],
            writeAccess: 'unverified',
          };
        }),
    };
  } catch {
    return {
      status:
        lastFailure === 401
          ? 'auth-required'
          : lastFailure === 403
            ? 'forbidden'
            : lastFailure === 429 ||
                (lastFailure !== undefined && lastFailure >= 500)
              ? 'unavailable'
              : 'discovery-failed',
    };
  } finally {
    await transport.close();
  }
};

export const discoverYandexCalendars = async (credentials: {
  username: string;
  appPassword: string;
}): Promise<YandexCalendarDiscoveryResult> => {
  const result = await discoverCalendars(credentials);
  createYandexAuthorizationObserver()(result.status);
  return result;
};
