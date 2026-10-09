import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';
import { BOOKINGS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER, PAIR_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from './pair-on-booking.field';

export default defineField({
  universalIdentifier: BOOKINGS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'studioBookings', label: 'Записи на сплит', icon: 'IconCalendarCheck',
  relationTargetObjectMetadataUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: PAIR_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
