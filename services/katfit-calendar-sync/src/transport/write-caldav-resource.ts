import { isStrongEtag } from './is-strong-etag';
import { isNonEmptyString } from '@sniptt/guards';
import {
  createCalendarObject,
  deleteCalendarObject,
  updateCalendarObject,
} from 'tsdav';

type CalDavResourceWrite =
  | { action: 'create'; calendarData: string }
  | { action: 'update'; calendarData: string; expectedEtag: string }
  | { action: 'delete'; expectedEtag: string };

export type CalDavResourceWriteResult =
  | { status: 'written'; etag: string | null }
  | {
      status:
        | 'conflict'
        | 'not-found'
        | 'auth-required'
        | 'forbidden'
        | 'retryable'
        | 'rejected';
      httpStatus: number;
    }
  | { status: 'invalid-target' | 'invalid-etag' | 'unconfirmed' };

export const writeCalDavResource = async ({
  calendarUrl,
  resourceUrl,
  operation,
  fetch,
}: {
  calendarUrl: string;
  resourceUrl: string;
  operation: CalDavResourceWrite;
  fetch: typeof globalThis.fetch;
}): Promise<CalDavResourceWriteResult> => {
  let calendar: URL;
  let resource: URL;

  try {
    calendar = new URL(calendarUrl);
    resource = new URL(resourceUrl);
  } catch {
    return { status: 'invalid-target' };
  }

  const collectionPath = calendar.pathname.endsWith('/')
    ? calendar.pathname
    : `${calendar.pathname}/`;
  let filename: string;
  try {
    filename = decodeURIComponent(
      resource.pathname.slice(collectionPath.length),
    );
  } catch {
    return { status: 'invalid-target' };
  }

  if (
    calendar.protocol !== 'https:' ||
    resource.origin !== calendar.origin ||
    calendar.username ||
    calendar.password ||
    resource.username ||
    resource.password ||
    calendar.search ||
    calendar.hash ||
    resource.search ||
    resource.hash ||
    !resource.pathname.startsWith(collectionPath) ||
    !isNonEmptyString(filename) ||
    filename === '.' ||
    filename === '..' ||
    /[/\\\x00-\x1f\x7f]/.test(filename) ||
    /%[a-f0-9]{2}/i.test(filename)
  ) {
    return { status: 'invalid-target' };
  }

  // Last-Modified and weak tags cannot protect a conditional resource write.
  if (operation.action !== 'create' && !isStrongEtag(operation.expectedEtag)) {
    return { status: 'invalid-etag' };
  }

  try {
    // The caller supplies the authenticated SSRF-safe fetch; redirects must not carry credentials elsewhere.
    const fetchOptions = { redirect: 'error' as const };
    const response =
      operation.action === 'create'
        ? await createCalendarObject({
            calendar: { url: `${calendar.origin}${collectionPath}` },
            filename,
            iCalString: operation.calendarData,
            headers: { 'If-None-Match': '*' },
            fetchOptions,
            fetch,
          })
        : operation.action === 'update'
          ? await updateCalendarObject({
              calendarObject: {
                url: resource.href,
                data: operation.calendarData,
                etag: operation.expectedEtag,
              },
              headers: { 'If-Match': operation.expectedEtag },
              fetchOptions,
              fetch,
            })
          : await deleteCalendarObject({
              calendarObject: {
                url: resource.href,
                etag: operation.expectedEtag,
              },
              headers: { 'If-Match': operation.expectedEtag },
              fetchOptions,
              fetch,
            });

    if (response.ok) {
      return { status: 'written', etag: response.headers.get('etag') };
    }

    const httpStatus = response.status;

    switch (httpStatus) {
      case 401:
        return { status: 'auth-required', httpStatus };
      case 403:
        return { status: 'forbidden', httpStatus };
      case 404:
        return { status: 'not-found', httpStatus };
      case 412:
        return { status: 'conflict', httpStatus };
      default:
        return {
          status:
            httpStatus === 429 || httpStatus >= 500 ? 'retryable' : 'rejected',
          httpStatus,
        };
    }
  } catch {
    // A lost response does not prove the server rejected the mutation.
    return { status: 'unconfirmed' };
  }
};
