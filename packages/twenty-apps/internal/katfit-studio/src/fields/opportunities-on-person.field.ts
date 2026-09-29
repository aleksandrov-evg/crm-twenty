import { defineField, FieldType, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { OPPORTUNITIES_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER, PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER } from './person-on-opportunity.field';

export default defineField({
  universalIdentifier: OPPORTUNITIES_ON_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'studioOpportunities',
  label: 'Воронка студии',
  icon: 'IconTargetArrow',
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_ON_OPPORTUNITY_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
