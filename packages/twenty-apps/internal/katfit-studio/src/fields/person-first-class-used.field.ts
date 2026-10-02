import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const PERSON_FIRST_CLASS_USED_FIELD_UNIVERSAL_IDENTIFIER =
  '28b98865-5bc2-4c4d-84f5-9d2f4760eac4';

export default defineField({
  universalIdentifier: PERSON_FIRST_CLASS_USED_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'firstClassUsed',
  label: 'Первое занятие использовано',
  description: 'Отмечает, что клиент уже использовал первое занятие по специальной цене',
  icon: 'IconUserCheck',
  defaultValue: false,
});
