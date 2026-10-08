import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership-transaction.object';

export const BOOKING_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER = 'a386ad5b-b62f-4b72-95b8-d2e8f8c2549a';
export const TRANSACTIONS_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = 'e60647d9-0307-4ce2-9948-6d750c0224b3';

export default defineField({
  universalIdentifier: BOOKING_ON_TRANSACTION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_TRANSACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'booking', label: 'Запись', icon: 'IconCalendarCheck',
  relationTargetObjectMetadataUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: TRANSACTIONS_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'bookingId' },
});
