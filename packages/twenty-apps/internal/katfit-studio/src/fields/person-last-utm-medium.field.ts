import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: 'e2769c3d-2ac2-40ab-b593-433f1e7658d8',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'lastUtmMedium',
  label: 'Last UTM medium',
  icon: 'IconSourceCode',
  isNullable: true,
});
