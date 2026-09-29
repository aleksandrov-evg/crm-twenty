import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-session.object';
import { BOOKINGS_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER, SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from './session-on-booking.field';

export default defineField({
  universalIdentifier: BOOKINGS_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'bookings', label: 'Записи', icon: 'IconCalendarCheck',
  relationTargetObjectMetadataUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
