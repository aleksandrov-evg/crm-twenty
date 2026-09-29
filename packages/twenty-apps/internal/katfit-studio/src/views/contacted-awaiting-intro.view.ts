import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-client-stage.field';
import { OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-contacted-at.field';
import { OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-lead-source.field';
import { PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-opportunity.field';

const opportunityFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.fields;

export const CONTACTED_AWAITING_INTRO_VIEW_UNIVERSAL_IDENTIFIER =
  'b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e';

export default defineView({
  universalIdentifier: CONTACTED_AWAITING_INTRO_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Связались — ждут intro',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconMessageCircle',
  position: 4,
  fields: [
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc10',
      fieldMetadataUniversalIdentifier: opportunityFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc11',
      fieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc12',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc13',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc14',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 140,
    },
  ],
  filters: [
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc15',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['CONTACTED'],
    },
  ],
  sorts: [
    {
      universalIdentifier: 'd1e2f3a4-b5c6-4789-9012-3456789abc16',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      direction: ViewSortDirection.ASC,
    },
  ],
});
