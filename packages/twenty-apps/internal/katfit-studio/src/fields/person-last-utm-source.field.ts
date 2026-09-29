import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '8e557d0c-f44e-4bf7-94dc-926fbbdded17',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'lastUtmSource',
  label: 'Last UTM source',
  icon: 'IconSourceCode',
  isNullable: true,
});
