import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: '62e4996f-0ffc-498b-96e9-9172a77b3dae',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'firstUtmMedium',
  label: 'First UTM medium',
  icon: 'IconSourceCode',
  isNullable: true,
});
