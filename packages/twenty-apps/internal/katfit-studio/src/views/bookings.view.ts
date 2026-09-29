import { defineView, ViewType } from 'twenty-sdk/define';

import { BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, BOOKING_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/booking.object';
import { PERSON_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-booking.field';
import { SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/session-on-booking.field';

export default defineView({
  universalIdentifier: 'c4916950-a2af-4315-b6f0-222324882a5d', name: 'Все записи',
  objectUniversalIdentifier: BOOKING_OBJECT_UNIVERSAL_IDENTIFIER, type: ViewType.TABLE, icon: 'IconCalendarCheck', position: 0,
  fields: [
    { universalIdentifier: '3e2f8784-4b65-4ee5-a93f-3c3ad60016db', fieldMetadataUniversalIdentifier: BOOKING_NAME_FIELD_UNIVERSAL_IDENTIFIER, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '7872f67c-fd3b-43ed-8fe9-a730b86fc3e8', fieldMetadataUniversalIdentifier: PERSON_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 190 },
    { universalIdentifier: 'a8739f26-696e-4865-b11f-cb6216c8ebdf', fieldMetadataUniversalIdentifier: SESSION_ON_BOOKING_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 210 },
  ],
});
