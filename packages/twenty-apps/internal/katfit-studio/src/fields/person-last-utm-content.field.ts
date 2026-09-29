import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '6906ddc8-c44f-4be1-982b-da4a01328f3a',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'lastUtmContent',
  label: 'Last UTM content',
  icon: 'IconSourceCode',
  isNullable: true,
});
