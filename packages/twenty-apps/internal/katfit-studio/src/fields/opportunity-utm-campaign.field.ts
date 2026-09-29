import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const OPPORTUNITY_UTM_CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIER =
  'ab7305bc-4dd6-45cb-bf76-8b44663e8969';

export default defineField({
  universalIdentifier: OPPORTUNITY_UTM_CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.TEXT,
  name: 'utmCampaign',
  label: 'UTM campaign',
  description: 'Снимок utm_campaign на момент заявки',
  icon: 'IconTargetArrow',
  isNullable: true,
});
