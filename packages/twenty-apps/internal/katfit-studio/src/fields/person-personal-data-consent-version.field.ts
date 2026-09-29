import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_PERSONAL_DATA_CONSENT_VERSION_FIELD_UNIVERSAL_IDENTIFIER =
  'ae6e7a59-4bca-4222-8261-6100faefed36';

export default defineField({
  universalIdentifier:
    PERSON_PERSONAL_DATA_CONSENT_VERSION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'personalDataConsentVersion',
  label: 'Версия согласия ПДн',
  icon: 'IconFileText',
  isNullable: true,
});
