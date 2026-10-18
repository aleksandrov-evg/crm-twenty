import { type LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { type LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';

export const createYandexCalDavLookup =
  (
    resolveAddresses: (
      hostname: string,
      options: { all: true },
    ) => Promise<LookupAddress[]> = lookup,
  ): LookupFunction =>
  (hostname, options, callback) => {
    if (hostname !== 'caldav.yandex.ru') {
      callback(new Error('CALDAV_HOST_REJECTED'), []);
      return;
    }

    // Validate the addresses used by the socket, not a separate preflight DNS lookup.
    void resolveAddresses(hostname, { all: true })
      .then((addresses) => {
        if (
          addresses.length === 0 ||
          addresses.some(
            ({ address }) =>
              !ipaddr.isValid(address) ||
              ipaddr.process(address).range() !== 'unicast',
          )
        ) {
          callback(new Error('CALDAV_ADDRESS_REJECTED'), []);
          return;
        }

        const matching = addresses.filter(
          ({ family }) => !options.family || options.family === family,
        );

        if (matching.length === 0) {
          callback(new Error('CALDAV_ADDRESS_UNAVAILABLE'), []);
        } else if (options.all) {
          callback(null, matching);
        } else {
          callback(null, matching[0].address, matching[0].family);
        }
      })
      .catch(() => callback(new Error('CALDAV_DNS_FAILED'), []));
  };
