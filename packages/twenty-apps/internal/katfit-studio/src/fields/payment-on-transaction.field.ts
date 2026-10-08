import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';
import { PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/payment.object';

export const PAYMENT_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER =
  '8e738fc9-a646-4a8e-b21b-0c233db2b0cf';
export const TRANSACTIONS_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER =
  '51257fc8-bc2a-4a78-b59b-285456ce6aa5';

export default defineField({
  universalIdentifier: PAYMENT_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'payment',
  label: 'Оплата',
  icon: 'IconCash',
  relationTargetObjectMetadataUniversalIdentifier:
    PAYMENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    TRANSACTIONS_ON_PAYMENT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'paymentId',
  },
});
