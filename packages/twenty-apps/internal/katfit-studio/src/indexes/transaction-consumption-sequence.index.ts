import { defineIndex } from 'twenty-sdk/define';

import { MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/membership-on-transaction.field';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';

export default defineIndex({
  universalIdentifier: '1d47cdce-6e4b-4acd-8ef3-8ba4a648195d',
  objectUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  isUnique: true,
  fields: [
    { universalIdentifier: '7943e49b-16dd-464c-bb0d-e03708191045', fieldUniversalIdentifier: MEMBERSHIP_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER },
    { universalIdentifier: '56b22059-52cc-4b23-987e-947227e4e1c7', fieldUniversalIdentifier: 'd9f6024d-93fc-4d80-9513-73ca92e61826' },
  ],
});
