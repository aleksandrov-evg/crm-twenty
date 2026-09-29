import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const OPPORTUNITY_FIRST_RESPONSE_MINUTES_FIELD_UNIVERSAL_IDENTIFIER = '91449426-27aa-49ac-8e91-e721f650406b';

export default defineField({
  universalIdentifier: OPPORTUNITY_FIRST_RESPONSE_MINUTES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.NUMBER,
  name: 'firstResponseMinutes',
  label: 'Время ответа, мин',
  icon: 'IconClockHour4',
  isNullable: true,
});
