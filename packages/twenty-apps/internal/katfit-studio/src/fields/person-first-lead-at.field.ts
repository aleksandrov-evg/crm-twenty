import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '5f61e2fc-069a-4b42-9acf-1f8d6547d6be',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'firstLeadAt',
  label: 'Первый лид',
  icon: 'IconCalendarClock',
  isNullable: true,
});
