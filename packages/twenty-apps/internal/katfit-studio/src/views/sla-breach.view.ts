import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-client-stage.field';
import { OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-contacted-at.field';
import { OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-lead-received-at.field';
import { PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-opportunity.field';

const opportunityFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.fields;

export const SLA_BREACH_VIEW_UNIVERSAL_IDENTIFIER =
  'e5653a1f-25d8-43b0-84fb-133a1235df0b';

export default defineView({
  universalIdentifier: SLA_BREACH_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Нарушение SLA',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconAlertTriangle',
  position: 1,
  fields: [
    {
      universalIdentifier: 'f6a4f157-0783-4978-b806-653706479302',
      fieldMetadataUniversalIdentifier: opportunityFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: 'b16f71d8-9be1-4189-b4d3-921aa51cd071',
      fieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '89f5f5ac-c504-49ee-be07-7930772eab54',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: 'fe0af868-0e1d-49fa-8a5f-dc68c8068d79',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '3d01e583-3f3f-4df0-b8d3-c88b97aae35a',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 140,
    },
  ],
  filters: [
    {
      universalIdentifier: 'abbc62a6-104a-4561-a5d9-e05b1b68468b',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CONTACTED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_EMPTY,
      value: '',
    },
    {
      universalIdentifier: 'f5cfb456-c73f-485d-b608-98daee129414',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['WAITLIST', 'NEW_LEAD'],
    },
  ],
  sorts: [
    {
      universalIdentifier: 'cdb0d21c-5d1c-4377-b104-377b87513494',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      direction: ViewSortDirection.ASC,
    },
  ],
});
