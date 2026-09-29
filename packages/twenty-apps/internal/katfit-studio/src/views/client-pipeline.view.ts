import { defineView, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS, ViewType } from 'twenty-sdk/define';

import { OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER, OPPORTUNITY_CLIENT_STAGE_OPTIONS } from 'src/fields/opportunity-client-stage.field';
import { PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from 'src/fields/person-on-opportunity.field';

const opportunityFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.fields;

const GROUP_IDS = [
  '7c61e637-2647-4f65-ac8f-7ce17d334c9a', '593755b3-6884-4ff9-a734-9f6e12b27219',
  '33c660ab-d560-47f0-8bc1-1c70ae3bfdf7', '5fbb40e6-e75e-49f9-aae4-b1263b363ec7',
  '62baaac8-d1e7-47bb-b918-e11c6b0a51f6', 'f6c57c04-3011-48dc-acb7-b65341ac5ee1',
  '46eaa094-bb29-4fc0-8669-41326e233cd6', '7cbbcc1b-b6d2-429b-b673-0c346527dd06',
];

export default defineView({
  universalIdentifier: 'e26266ef-ef2b-4526-ae7e-eb6ef9a74141',
  name: 'Воронка первой покупки',
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: ViewType.KANBAN,
  icon: 'IconLayoutKanban',
  position: 0,
  mainGroupByFieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    { universalIdentifier: '45e979f8-5a5d-4002-b9ea-18917473a0f8', fieldMetadataUniversalIdentifier: opportunityFields.name.universalIdentifier, position: 0, isVisible: true, size: 220 },
    { universalIdentifier: 'e0ecf2fb-e88e-44f3-a79b-9cc4ee12347b', fieldMetadataUniversalIdentifier: OPPORTUNITY_CLIENT_STAGE_FIELD_UNIVERSAL_IDENTIFIER, position: 1, isVisible: true, size: 160 },
    { universalIdentifier: 'fd7ad48f-be7b-47f3-86bc-04cc0d19b0ce', fieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER, position: 2, isVisible: true, size: 180 },
  ],
  groups: OPPORTUNITY_CLIENT_STAGE_OPTIONS.map((option, index) => ({
    universalIdentifier: GROUP_IDS[index], fieldValue: option.value, position: index, isVisible: true,
  })),
});
