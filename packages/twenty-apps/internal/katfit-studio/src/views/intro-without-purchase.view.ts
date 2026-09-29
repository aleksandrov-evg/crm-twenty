import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-client-stage.field';
import { OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-lead-received-at.field';
import { PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-opportunity.field';

const opportunityFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.fields;

export const INTRO_WITHOUT_PURCHASE_VIEW_UNIVERSAL_IDENTIFIER =
  'e40f6008-07ef-4c95-a55a-14536be8ea81';

export default defineView({
  universalIdentifier: INTRO_WITHOUT_PURCHASE_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Intro без покупки',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconUserHeart',
  position: 3,
  fields: [
    {
      universalIdentifier: '5ecdc751-69c0-4a86-984b-ecc9496338bb',
      fieldMetadataUniversalIdentifier: opportunityFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: 'df347bbd-b151-4add-88ee-ad63148128fe',
      fieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '065c93b6-7316-4271-9d3e-0191f6e86f41',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '07ab9107-0f60-484b-aa4e-dea0ff48652f',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 160,
    },
  ],
  filters: [
    {
      universalIdentifier: '48321a26-5e2f-433d-96b7-a825023c4aa3',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['INTRO_ATTENDED'],
    },
  ],
  sorts: [
    {
      universalIdentifier: '221d68be-131a-4048-ba4b-33b1751dae98',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      direction: ViewSortDirection.ASC,
    },
  ],
});
