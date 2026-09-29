import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_NEXT_ACTION_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '97f6708f-4cb7-41c7-bb95-cecee6600e7e';

export default defineField({
  universalIdentifier: PERSON_NEXT_ACTION_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'nextActionAt',
  label: 'Следующее действие',
  description: 'Дата и время следующего шага по активному лиду',
  icon: 'IconCalendarDue',
  isNullable: true,
});
