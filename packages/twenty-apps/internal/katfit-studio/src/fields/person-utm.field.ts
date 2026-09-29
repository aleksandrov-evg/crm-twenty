import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: 'd2c3013f-04eb-4d0c-aab6-f99f4f174112',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'firstUtmCampaign',
  label: 'Первая UTM campaign',
  description: 'Кампания первого касания; после заполнения не перезаписывается',
  icon: 'IconTargetArrow',
  isNullable: true,
});
