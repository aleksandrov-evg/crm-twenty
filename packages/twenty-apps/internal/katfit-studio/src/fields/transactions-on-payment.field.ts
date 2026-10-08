import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import {
  PAYMENT_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER,
  TRANSACTIONS_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/payment-on-transaction.field';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export default defineField({
  universalIdentifier: TRANSACTIONS_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'membershipTransactions',
  label: 'Операции пакетов',
  icon: 'IconListDetails',
  relationTargetObjectMetadataUniversalIdentifier:
    MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PAYMENT_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
