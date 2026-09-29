import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_MARKETING_CONSENT_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '12827a32-b887-4f01-a776-9b7f30a47df6';

export default defineField({
  universalIdentifier: PERSON_MARKETING_CONSENT_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'marketingConsentAt',
  label: 'Дата маркетингового согласия',
  icon: 'IconCalendarCheck',
  isNullable: true,
});
