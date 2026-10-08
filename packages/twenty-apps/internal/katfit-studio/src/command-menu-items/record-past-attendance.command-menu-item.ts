import { defineCommandMenuItem, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { RECORD_PAST_ATTENDANCE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/record-past-attendance.front-component';

export default defineCommandMenuItem({
  universalIdentifier: '64cfb1c5-b780-43b0-b871-4baeb47147c5',
  label: 'Внести прошедшее занятие',
  shortLabel: 'Прошедшее занятие',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  frontComponentUniversalIdentifier: RECORD_PAST_ATTENDANCE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
