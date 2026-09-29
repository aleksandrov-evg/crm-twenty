import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '15d90d5a-43d0-48f7-b444-ffea1c25fc0e',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'firstUtmTerm',
  label: 'First UTM term',
  icon: 'IconSourceCode',
  isNullable: true,
});
