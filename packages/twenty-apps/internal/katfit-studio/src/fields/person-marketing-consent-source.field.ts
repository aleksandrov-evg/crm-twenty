import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_MARKETING_CONSENT_SOURCE_FIELD_UNIVERSAL_IDENTIFIER =
  'b3df3421-c91a-418f-8dcb-d81e4843abba';

export default defineField({
  universalIdentifier:
    PERSON_MARKETING_CONSENT_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'marketingConsentSource',
  label: 'Источник согласия',
  icon: 'IconSourceCode',
  isNullable: true,
});
