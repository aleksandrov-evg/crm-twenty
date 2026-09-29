import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_PERSONAL_DATA_CONSENT_AT_FIELD_UNIVERSAL_IDENTIFIER =
  'e33e18ef-c5c3-4499-bc98-c57003644a92';

export default defineField({
  universalIdentifier: PERSON_PERSONAL_DATA_CONSENT_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'personalDataConsentAt',
  label: 'Дата согласия ПДн',
  icon: 'IconCalendarCheck',
  isNullable: true,
});
