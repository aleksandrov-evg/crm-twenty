import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';

export const MEMBERSHIP_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = '91966eae-d0b8-430c-ab2a-ee82967500e4';
export const BOOKINGS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER = '99487b70-5fae-4f57-9eb4-997b2cf3704d';

export default defineField({
  universalIdentifier: MEMBERSHIP_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'membership', label: 'Пакет клиента', icon: 'IconTicket',
  relationTargetObjectMetadataUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: BOOKINGS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'membershipId' },
});
