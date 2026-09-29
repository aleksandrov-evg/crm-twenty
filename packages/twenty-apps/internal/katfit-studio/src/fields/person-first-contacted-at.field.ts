import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_FIRST_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  'c155e727-ce93-43e3-aed6-4fe00b312ebd';

export default defineField({
  universalIdentifier: PERSON_FIRST_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'firstContactedAt',
  label: 'Первый ответ',
  description: 'Когда менеджер впервые содержательно связался с лидом',
  icon: 'IconPhoneCall',
  isNullable: true,
});
