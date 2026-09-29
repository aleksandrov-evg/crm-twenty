import { defineField, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/class-session.object';

export const SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER = 'ac595b7c-5aee-4728-80ce-d5367bdcaea4';
export const BOOKINGS_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER = 'd37059a8-1e1a-4176-bef6-4bb7e921253c';

export default defineField({
  universalIdentifier: SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION, name: 'classSession', label: 'Занятие', icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier: CLASS_SESSION_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: BOOKINGS_ON_SESSION_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.SET_NULL, joinColumnName: 'classSessionId' },
});
