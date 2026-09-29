import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '9e2dfd8c-f9bd-45e2-9f50-3fa51099008e',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'marketingConsent',
  label: 'Маркетинговое согласие',
  description: 'Разрешены маркетинговые сообщения студии',
  icon: 'IconMailCheck',
  defaultValue: false,
});
