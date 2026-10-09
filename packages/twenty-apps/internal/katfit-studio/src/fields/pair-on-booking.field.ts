import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { PAIR_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/pair.object';

export const PAIR_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = '1d6541ba-2d0c-42ec-a636-340033aacd50';
export const BOOKINGS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER = '9bde9674-a2f2-490f-8656-a28f1cabb922';

export default defineField({
  universalIdentifier: PAIR_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'pair', label: 'Пара', icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier: PAIR_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: BOOKINGS_ON_PAIR_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.RESTRICT, joinColumnName: 'pairId' },
});
