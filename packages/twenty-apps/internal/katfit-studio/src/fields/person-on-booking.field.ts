import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';

export const PERSON_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = '68cd9f72-ab40-4f18-8b42-195ffcd02e76';
export const BOOKINGS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER = 'f08e4c33-4b45-489c-a69f-c9f54bf65e1a';

export default defineField({
  universalIdentifier: PERSON_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'person', label: 'Клиент', icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: BOOKINGS_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'personId' },
});
