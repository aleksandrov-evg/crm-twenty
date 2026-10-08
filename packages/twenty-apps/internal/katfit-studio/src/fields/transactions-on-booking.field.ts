import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';
import { BOOKING_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER, TRANSACTIONS_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from './booking-on-transaction.field';

export default defineField({
  universalIdentifier: TRANSACTIONS_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'transactions', label: 'Операции пакета', icon: 'IconListDetails',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: BOOKING_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
