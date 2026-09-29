import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import { OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-client-stage.field';
import { OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-lead-received-at.field';
import { OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/opportunity-lead-source.field';
import { PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-opportunity.field';

const opportunityFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.fields;

export const NEW_LEADS_VIEW_UNIVERSAL_IDENTIFIER =
  'adefed3b-aedf-47c9-91a6-42837578374e';

export default defineView({
  universalIdentifier: NEW_LEADS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Новые лиды',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconUserPlus',
  position: 0,
  fields: [
    {
      universalIdentifier: 'fab5d474-bc82-4487-a5aa-b3caafad95c0',
      fieldMetadataUniversalIdentifier: opportunityFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: '05c14eaa-3c7c-47b7-a1f4-65545fcd77fc',
      fieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '39e46772-b243-4598-9d02-0ce77dd8f023',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '781ae8fb-f495-4f95-821a-dec959e09d6b',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '561348ea-a6ab-43e8-8536-076786bc816e',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_SOURCE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 140,
    },
  ],
  filters: [
    {
      universalIdentifier: '9b92eac3-b4e1-4783-b17b-0937f76b510b',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['WAITLIST', 'NEW_LEAD'],
    },
  ],
  sorts: [
    {
      universalIdentifier: 'cb269cf4-7dd9-4f21-b11a-4168535c5429',
      fieldMetadataUniversalIdentifier: OPPORTUNITY_LEAD_RECEIVED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      direction: ViewSortDirection.ASC,
    },
  ],
});
