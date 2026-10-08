import { defineIndex } from 'twenty-sdk/define';

import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export default defineIndex({
  universalIdentifier: '8d76c523-d789-4708-ac71-0906642e0484',
  objectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  isUnique: true,
  fields: [
    {
      universalIdentifier: '3fb5bbe6-5025-40dc-ad5e-fb24adbce76a',
      fieldUniversalIdentifier: '6c1c56f7-6756-4730-9969-d1402f4a9a3d',
    },
  ],
});
