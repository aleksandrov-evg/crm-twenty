import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '187d6f66-39c6-4b85-af51-4b5f3942ec54',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'lastLeadAt',
  label: 'Последний лид',
  icon: 'IconCalendarClock',
  isNullable: true,
});
