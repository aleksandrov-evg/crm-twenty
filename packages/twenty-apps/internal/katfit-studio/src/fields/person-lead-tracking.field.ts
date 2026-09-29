import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

const PERSON_OBJECT_UNIVERSAL_IDENTIFIER =
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier;

export default defineField({
  universalIdentifier: '6df4a9d0-50a3-48d7-9140-504cb0ca273d',
  objectUniversalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'landingLeadId',
  label: 'ID лида лендинга',
  description: 'Стабильный внешний идентификатор заявки studio.katfit.ru',
  icon: 'IconId',
  isNullable: true,
});
