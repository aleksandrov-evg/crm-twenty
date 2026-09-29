import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER = '014a4c74-4094-40c6-835d-8495e7549c3f';

export default defineField({
  universalIdentifier: OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'contactedAt',
  label: 'Первый ответ',
  icon: 'IconMessageCheck',
  isNullable: true,
});
