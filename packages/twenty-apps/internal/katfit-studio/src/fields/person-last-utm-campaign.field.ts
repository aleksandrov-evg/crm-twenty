import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: 'f962150b-3bd5-4a0f-bf73-6ed2c3880229',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'lastUtmCampaign',
  label: 'Last UTM campaign',
  icon: 'IconTargetArrow',
  isNullable: true,
});
