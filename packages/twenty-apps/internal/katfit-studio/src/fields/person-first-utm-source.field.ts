import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '9cd1dc05-bb83-41fe-aab6-b8da1ce04d0b',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'firstUtmSource',
  label: 'First UTM source',
  icon: 'IconSourceCode',
  isNullable: true,
});
