import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '31c52056-8b15-4269-b3bf-af0f3847f57e',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'lastUtmTerm',
  label: 'Last UTM term',
  icon: 'IconSourceCode',
  isNullable: true,
});
