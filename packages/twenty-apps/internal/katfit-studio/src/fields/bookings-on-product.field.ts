import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/product.object';
import { BOOKINGS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER, PRODUCT_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from './product-on-booking.field';

export default defineField({
  universalIdentifier: BOOKINGS_ON_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'bookings', label: 'Записи', icon: 'IconCalendarCheck',
  relationTargetObjectMetadataUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: PRODUCT_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
