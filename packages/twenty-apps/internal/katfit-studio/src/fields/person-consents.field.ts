import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '011fb4fc-3ec0-4826-a396-3acb17c5787a',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'personalDataConsent',
  label: 'Согласие ПДн',
  description: 'Получено обязательное согласие на обработку персональных данных',
  icon: 'IconShieldCheck',
  defaultValue: false,
});
