import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/membership.object';
import { BOOKINGS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER, MEMBERSHIP_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from './membership-on-booking.field';

export default defineField({
  universalIdentifier: BOOKINGS_ON_MEMBERSHIP_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: MEMBERSHIP_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'bookings', label: 'Записи', icon: 'IconCalendarCheck',
  relationTargetObjectMetadataUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: MEMBERSHIP_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
