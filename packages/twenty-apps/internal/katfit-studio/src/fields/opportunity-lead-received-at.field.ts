import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export const OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER = '26a5940c-557d-4544-8052-bb4c3b9e6b05';

export default defineField({
  universalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'leadReceivedAt',
  label: 'Лид получен',
  icon: 'IconCalendarPlus',
  isNullable: true,
});
