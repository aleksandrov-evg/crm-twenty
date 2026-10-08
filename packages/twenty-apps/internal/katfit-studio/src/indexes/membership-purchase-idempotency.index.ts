import { defineIndex } from 'twenty-sdk/define';

import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';

export default defineIndex({
  universalIdentifier: '83c1562e-083b-4dba-85c3-0f174cb56e11',
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  isUnique: true,
  fields: [
    {
      universalIdentifier: '2d54c937-ea12-47a7-ba6c-f1a8b0057bd5',
      fieldUniversalIdentifier: '644831ad-0218-4fb9-9595-85f4124733ae',
    },
  ],
});
